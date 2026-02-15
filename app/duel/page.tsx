"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";

type DuelQuestion = {
  id: string;
  q: string;
  a: number;
  unit?: string;
};

function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function DuelPage() {
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [roomInput, setRoomInput] = useState("");
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [myGuess, setMyGuess] = useState("");
  const [mySubmitted, setMySubmitted] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [allResults, setAllResults] = useState<any[]>([]);
  const [showRoundResult, setShowRoundResult] = useState(false);
  const pollRef = useRef<any>(null);

  const questionMap = useMemo(() => {
    const m = new Map<string, DuelQuestion>();
    (duelQuestions as DuelQuestion[]).forEach(q => m.set(q.id, q));
    return m;
  }, []);

  function startPolling(code: string) {
    stopPolling();
    pollRef.current = setInterval(() => refresh(code), 800);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  async function createRoom() {
    const code = randomCode();
    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: []
    });

    const token = crypto.randomUUID();

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "A"
    });

    setRoomInput(code);
    setMySlot("A");
    startPolling(code);
  }

  async function joinRoom() {
    const code = roomInput.trim().toUpperCase();
    const res = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    if (res.data.length >= 2) return;

    const token = crypto.randomUUID();

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "B"
    });

    setMySlot("B");
    startPolling(code);
  }

  async function refresh(code: string) {
    const roomRes = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", code)
      .single();

    if (!roomRes.data) return;

    setRoom(roomRes.data);

    const playerRes = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    setPlayers(playerRes.data || []);

    if (roomRes.data.status === "playing") {
      const subs = await supabase
        .from("duel_submissions")
        .select("*")
        .eq("room_code", code)
        .eq("q_index", roomRes.data.current_q);

      setSubmissions(subs.data || []);

      if (subs.data.length === 2 && !showRoundResult) {
        await finalizeRound(roomRes.data);
      }
    }

    if (roomRes.data.status === "finished") {
      const results = await supabase
        .from("duel_results")
        .select("*")
        .eq("room_code", code)
        .order("q_index", { ascending: true });

      setAllResults(results.data || []);
    }
  }

  async function seedQuestions(code: string) {
    const chosen = [];
    while (chosen.length < 3) {
      const q = duelQuestions[Math.floor(Math.random() * duelQuestions.length)];
      if (!chosen.includes(q.id)) chosen.push(q.id);
    }

    await supabase
      .from("duel_rooms")
      .update({ question_ids: chosen, status: "playing" })
      .eq("code", code);
  }

  async function finalizeRound(r: any) {
    const ids = r.question_ids;
    const qId = ids[r.current_q];
    const q = questionMap.get(qId);

    const subRes = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", r.code)
      .eq("q_index", r.current_q);

    const A = subRes.data.find((s: any) => s.slot === "A");
    const B = subRes.data.find((s: any) => s.slot === "B");

    const diffA = Math.abs(A.guess - q!.a);
    const diffB = Math.abs(B.guess - q!.a);

    let winner = "A";
    if (diffB < diffA) winner = "B";
    if (diffA === diffB)
      winner =
        new Date(A.submitted_at).getTime() <
        new Date(B.submitted_at).getTime()
          ? "A"
          : "B";

    await supabase.from("duel_results").insert({
      room_code: r.code,
      q_index: r.current_q,
      winner,
      answer: q!.a
    });

    setRoundResult({ winner, answer: q!.a });
    setShowRoundResult(true);

    setTimeout(async () => {
      setShowRoundResult(false);
      setMyGuess("");
      setMySubmitted(false);

      if (r.current_q === 2) {
        await supabase
          .from("duel_rooms")
          .update({ status: "finished" })
          .eq("code", r.code);
      } else {
        await supabase
          .from("duel_rooms")
          .update({ current_q: r.current_q + 1 })
          .eq("code", r.code);
      }
    }, 5000);
  }

  async function submitGuess() {
    if (!room || mySubmitted) return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(myGuess)
    });

    setMySubmitted(true);
  }

  const currentQuestion =
    room?.question_ids &&
    questionMap.get(room.question_ids[room.current_q]);

  return (
    <main style={{ padding: 40, background: "#111", minHeight: "100vh", color: "white" }}>
      <h1>Duel</h1>

      {!room && (
        <>
          <button onClick={createRoom}>Create Room</button>
          <input
            value={roomInput}
            onChange={e => setRoomInput(e.target.value)}
            style={{ marginLeft: 10, background: "#222", color: "white" }}
          />
          <button onClick={joinRoom}>Join</button>
        </>
      )}

      {room && (
        <>
          <p>Room: {room.code}</p>
          <p>Status: {room.status}</p>

          {room.status === "waiting" && players.length === 2 && (
            <button onClick={() => seedQuestions(room.code)}>Start Duel</button>
          )}

          {room.status === "playing" && currentQuestion && (
            <>
              <h2>{currentQuestion.q}</h2>

              <input
                value={myGuess}
                disabled={mySubmitted}
                onChange={e => setMyGuess(e.target.value.replace(/[^0-9]/g, ""))}
                style={{ background: "#222", color: "white" }}
              />

              <button disabled={mySubmitted} onClick={submitGuess}>
                Submit
              </button>

              {showRoundResult && (
                <div style={{ marginTop: 20 }}>
                  <h3>Round Winner: {roundResult.winner}</h3>
                  <p>Correct answer: {roundResult.answer}</p>
                </div>
              )}
            </>
          )}

          {room.status === "finished" && (
            <>
              <h2>Duel Finished</h2>

              {allResults.length === 3 && (() => {
                const winsA = allResults.filter(r => r.winner === "A").length;
                const winsB = 3 - winsA;
                const winner = winsA > winsB ? "A" : "B";

                const winnerWins = Math.max(winsA, winsB);

                let winnerMove = winnerWins === 3 ? 3 : 2;
                let loserMove = winnerWins === 3 ? -1 : 0;

                return (
                  <>
                    <p>Rounds: A {winsA} | B {winsB}</p>
                    <h3>Winner: {winner}</h3>
                    <p>Winner movement: +{winnerMove}</p>
                    <p>Loser movement: {loserMove}</p>
                  </>
                );
              })()}
            </>
          )}
        </>
      )}
    </main>
  );
}
