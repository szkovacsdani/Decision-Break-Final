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

type Room = {
  code: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
  question_ids: string[];
  round_started_at?: string | null;
};

type Submission = {
  slot: "A" | "B";
  guess: number;
  submitted_at: string;
};

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function abs(n: number) {
  return n < 0 ? -n : n;
}

export default function DuelPage() {
  const [room, setRoom] = useState<Room | null>(null);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [guess, setGuess] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [countdown, setCountdown] = useState(10);

  const pollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const questionsMap = useMemo(() => {
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

  function startCountdown(startTime: string) {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
      const left = 10 - elapsed;
      setCountdown(left > 0 ? left : 0);
    }, 200);
  }

  async function createRoom() {
    const code = randomCode();
    const qids = shuffleQuestions().slice(0, 3);

    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: qids,
      round_started_at: null
    });

    await supabase.from("duel_players").insert({
      room_code: code,
      slot: "A"
    });

    setMySlot("A");
    setRoomInput(code);
    startPolling(code);
  }

  async function joinRoom() {
    const code = roomInput.trim().toUpperCase();
    const { data } = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    if (data?.length === 1) {
      await supabase.from("duel_players").insert({
        room_code: code,
        slot: "B"
      });

      await supabase.from("duel_rooms")
        .update({ status: "playing", round_started_at: new Date().toISOString() })
        .eq("code", code);

      setMySlot("B");
      startPolling(code);
    }
  }

  async function submitGuess() {
    if (!room || !mySlot || guess === "") return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(guess),
      submitted_at: new Date().toISOString()
    });

    setGuess("");
  }

  async function refresh(code: string) {
    const { data: r } = await supabase.from("duel_rooms").select("*").eq("code", code).single();
    if (!r) return;

    setRoom(r);

    if (r.status === "playing") {
      startCountdown(r.round_started_at);

      const { data: subs } = await supabase
        .from("duel_submissions")
        .select("*")
        .eq("room_code", code)
        .eq("q_index", r.current_q);

      setSubmissions(subs || []);

      const elapsed = Math.floor((Date.now() - new Date(r.round_started_at).getTime()) / 1000);
      if (elapsed >= 10) {
        await finalizeRound(r, subs || []);
      }

      if (subs?.length === 2) {
        await finalizeRound(r, subs);
      }
    }

    if (r.status === "finished") {
      const { data: results } = await supabase
        .from("duel_results")
        .select("*")
        .eq("room_code", code);

      if (results) {
        const winsA = results.filter((x: any) => x.winner === "A").length;
        const winsB = 3 - winsA;

        let moveText = "";
        let winnerSlot = winsA > winsB ? "A" : "B";

        if (winsA === 3 || winsB === 3)
          moveText = `${winnerSlot} moves forward 3 spaces. Opponent moves back 1 space.`;
        else
          moveText = `${winnerSlot} moves forward 2 spaces.`;

        setFinalResult({
          winsA,
          winsB,
          winnerSlot,
          moveText
        });
      }
    }
  }

  async function finalizeRound(r: Room, subs: Submission[]) {
    const qid = r.question_ids[r.current_q];
    const q = questionsMap.get(qid);
    if (!q) return;

    let winner: "A" | "B";

    if (subs.length === 0) {
      winner = Math.random() < 0.5 ? "A" : "B";
    } else if (subs.length === 1) {
      winner = subs[0].slot;
    } else {
      const A = subs.find(s => s.slot === "A")!;
      const B = subs.find(s => s.slot === "B")!;

      const diffA = abs(A.guess - q.a);
      const diffB = abs(B.guess - q.a);

      if (diffA < diffB) winner = "A";
      else if (diffB < diffA) winner = "B";
      else {
        winner =
          new Date(A.submitted_at).getTime() <
          new Date(B.submitted_at).getTime()
            ? "A"
            : "B";
      }
    }

    await supabase.from("duel_results").insert({
      room_code: r.code,
      q_index: r.current_q,
      winner
    });

    if (r.current_q === 2) {
      await supabase.from("duel_rooms").update({ status: "finished" }).eq("code", r.code);
    } else {
      setTimeout(async () => {
        await supabase
          .from("duel_rooms")
          .update({
            current_q: r.current_q + 1,
            round_started_at: new Date().toISOString()
          })
          .eq("code", r.code);

        setRoundResult(null);
        setSubmissions([]);
      }, 5000);
    }
  }

  function shuffleQuestions() {
    return (duelQuestions as DuelQuestion[])
      .map(q => q.id)
      .sort(() => Math.random() - 0.5);
  }

  const currentQuestion =
    room && room.status === "playing"
      ? questionsMap.get(room.question_ids[room.current_q])
      : null;

  return (
    <main style={{ padding: 30, color: "white" }}>
      <h1>Duel</h1>

      <button onClick={createRoom}>Create Room</button>

      <input
        value={roomInput}
        onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
        placeholder="Enter code"
        style={{ marginLeft: 10 }}
      />

      <button onClick={joinRoom}>Join</button>

      {room && (
        <>
          <h2>Room: {room.code}</h2>
          <p>Status: {room.status}</p>
          <p>Player A (Room Creator) vs Player B (Join Player)</p>
          <p>You are: Player {mySlot}</p>

          {room.status === "playing" && currentQuestion && (
            <>
              <h3>Round {room.current_q + 1} / 3</h3>
              <p>{currentQuestion.q}</p>
              <p>Time left: {countdown}s</p>

              <input
                value={guess}
                onChange={(e) => setGuess(e.target.value.replace(/[^0-9]/g, ""))}
              />
              <button onClick={submitGuess}>Submit</button>
            </>
          )}

          {room.status === "finished" && finalResult && (
            <>
              <h2>Duel Finished</h2>
              <p>Score: A {finalResult.winsA} - B {finalResult.winsB}</p>
              <p>Winner: Player {finalResult.winnerSlot}</p>
              <p>{finalResult.moveText}</p>
            </>
          )}
        </>
      )}
    </main>
  );
}
