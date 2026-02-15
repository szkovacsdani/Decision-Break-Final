"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";

const ROUND_TIME = 10;
const BREAK_TIME = 5;

function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function pick3() {
  const shuffled = [...duelQuestions].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3).map((q: any) => q.id);
}

function abs(n: number) {
  return n < 0 ? -n : n;
}

export default function DuelPage() {
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [myGuess, setMyGuess] = useState("");
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);

  const pollRef = useRef<any>(null);

  const questionsById = useMemo(() => {
    const m = new Map();
    duelQuestions.forEach((q: any) => m.set(q.id, q));
    return m;
  }, []);

  /* ---------------- ROOM FLOW ---------------- */

  async function createRoom() {
    const code = randomCode();
    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: [],
      round_started_at: null,
    });

    await supabase.from("duel_players").insert({
      room_code: code,
      slot: "A",
    });

    setMySlot("A");
    setRoomCodeInput(code);
    await refresh(code);
    startPolling(code);
  }

  async function joinRoom() {
    const code = roomCodeInput.trim().toUpperCase();
    const { data } = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    if (data.length >= 2) return;

    await supabase.from("duel_players").insert({
      room_code: code,
      slot: "B",
    });

    setMySlot("B");
    await refresh(code);
    startPolling(code);
  }

  async function startGameIfReady(r: any) {
    if (r.status !== "waiting") return;

    const { data } = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", r.code);

    if (data.length === 2) {
      await supabase
        .from("duel_rooms")
        .update({
          status: "playing",
          question_ids: pick3(),
          round_started_at: new Date().toISOString(),
        })
        .eq("code", r.code);
    }
  }

  /* ---------------- SUBMIT ---------------- */

  async function submitGuess() {
    if (!room || !mySlot) return;
    if (!myGuess) return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(myGuess),
      created_at: new Date().toISOString(),
    });

    setMyGuess("");
    await refresh(room.code);
  }

  /* ---------------- ROUND FINALIZE ---------------- */

  async function finalizeRound(r: any) {
    const { data } = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", r.code)
      .eq("q_index", r.current_q);

    const qId = r.question_ids[r.current_q];
    const q = questionsById.get(qId);

    let winner: "A" | "B";

    const subA = data.find((s: any) => s.slot === "A");
    const subB = data.find((s: any) => s.slot === "B");

    if (!subA && !subB) {
      winner = Math.random() > 0.5 ? "A" : "B";
    } else if (!subA) {
      winner = "B";
    } else if (!subB) {
      winner = "A";
    } else {
      const diffA = abs(subA.guess - q.a);
      const diffB = abs(subB.guess - q.a);

      if (diffA < diffB) winner = "A";
      else if (diffB < diffA) winner = "B";
      else {
        winner =
          new Date(subA.created_at).getTime() <
          new Date(subB.created_at).getTime()
            ? "A"
            : "B";
      }
    }

    await supabase.from("duel_results").insert({
      room_code: r.code,
      q_index: r.current_q,
      winner,
    });

    if (r.current_q === 2) {
      await supabase
        .from("duel_rooms")
        .update({ status: "finished" })
        .eq("code", r.code);
    } else {
      await supabase
        .from("duel_rooms")
        .update({
          current_q: r.current_q + 1,
          round_started_at: new Date(Date.now() + BREAK_TIME * 1000).toISOString(),
        })
        .eq("code", r.code);
    }
  }

  /* ---------------- POLLING ---------------- */

  async function refresh(code: string) {
    const { data: r } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!r) return;

    setRoom(r);

    const { data: p } = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    setPlayers(p || []);

    const { data: s } = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", code)
      .eq("q_index", r.current_q);

    setSubmissions(s || []);

    const { data: res } = await supabase
      .from("duel_results")
      .select("*")
      .eq("room_code", code)
      .order("q_index");

    setResults(res || []);

    await startGameIfReady(r);

    if (r.status === "playing" && r.round_started_at) {
      const started = new Date(r.round_started_at).getTime();
      const diff = Math.floor((Date.now() - started) / 1000);
      const left = ROUND_TIME - diff;

      if (left <= 0) {
        await finalizeRound(r);
      } else {
        setTimeLeft(left);
      }
    }
  }

  function startPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => refresh(code), 500);
  }

  /* ---------------- FINAL SUMMARY ---------------- */

  const finalSummary = useMemo(() => {
    if (!room || room.status !== "finished") return null;
    if (results.length < 3) return null;

    const winsA = results.filter((r) => r.winner === "A").length;
    const winsB = results.filter((r) => r.winner === "B").length;

    const duelWinner = winsA > winsB ? "A" : "B";

    if (winsA === 3 || winsB === 3) {
      return {
        text: `${duelWinner} wins 3-0 → Winner move forward 3 spaces, loser move back 1 space`,
      };
    } else {
      return {
        text: `${duelWinner} wins 2-1 → Winner move forward 2 spaces`,
      };
    }
  }, [room, results]);

  /* ---------------- UI ---------------- */

  return (
    <main style={{ padding: 40 }}>
      <h1>Duel</h1>

      <button onClick={createRoom}>Create Room</button>
      <input
        value={roomCodeInput}
        onChange={(e) => setRoomCodeInput(e.target.value)}
      />
      <button onClick={joinRoom}>Join</button>

      {room && (
        <>
          <p>Room: {room.code}</p>
          <p>Status: {room.status}</p>
          <p>
            Player A (Room Creator) vs Player B (Join Player)
          </p>
          <p>You are: Player {mySlot}</p>
        </>
      )}

      {room?.status === "playing" && (
        <>
          <p>Time left: {timeLeft}s</p>
          <input
            value={myGuess}
            onChange={(e) => setMyGuess(e.target.value)}
          />
          <button onClick={submitGuess}>Submit</button>
        </>
      )}

      {finalSummary && (
        <>
          <h2>Duel Finished</h2>
          <p>{finalSummary.text}</p>
        </>
      )}
    </main>
  );
}
