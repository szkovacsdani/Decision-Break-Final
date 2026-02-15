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

type DuelRoom = {
  code: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
  question_ids: string[];
  round_started_at: string | null;
};

type DuelPlayer = {
  room_code: string;
  player_token: string;
  slot: "A" | "B";
};

type DuelSubmission = {
  slot: "A" | "B";
  guess: number;
  submitted_at: string;
};

type DuelResult = {
  winner: "A" | "B";
  p1_diff: number | null;
  p2_diff: number | null;
};

const ROUND_TIMEOUT = 10000;

function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function getRoomToken(code: string) {
  const key = `duel_token_${code}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(key, token);
  return token;
}

export default function DuelPage() {
  const [room, setRoom] = useState<DuelRoom | null>(null);
  const [players, setPlayers] = useState<DuelPlayer[]>([]);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [guess, setGuess] = useState("");
  const [submissions, setSubmissions] = useState<DuelSubmission[]>([]);
  const [result, setResult] = useState<DuelResult | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const pollRef = useRef<number | null>(null);

  const questionMap = useMemo(() => {
    const m = new Map<string, DuelQuestion>();
    (duelQuestions as DuelQuestion[]).forEach(q => m.set(q.id, q));
    return m;
  }, []);

  function startPolling(code: string) {
    stopPolling();
    pollRef.current = window.setInterval(() => refresh(code), 700);
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
      question_ids: [],
      round_started_at: null,
    });

    const token = getRoomToken(code);
    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "A",
    });

    await refresh(code);
    startPolling(code);
  }

  async function joinRoom() {
    const code = roomInput.toUpperCase();
    const token = getRoomToken(code);

    const { data: players } = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    if (players?.length === 1) {
      await supabase.from("duel_players").insert({
        room_code: code,
        player_token: token,
        slot: "B",
      });
    }

    await refresh(code);
    startPolling(code);
  }

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

    const token = getRoomToken(code);
    const me = p?.find(x => x.player_token === token);
    setMySlot(me?.slot || null);

    if (r.status === "playing") {
      await handlePlaying(r);
    }
  }

  async function handlePlaying(r: DuelRoom) {
    const qId = r.question_ids[r.current_q];
    const question = questionMap.get(qId);
    if (!question) return;

    const { data: subs } = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", r.code)
      .eq("q_index", r.current_q);

    setSubmissions(subs || []);

    const { data: existingResult } = await supabase
      .from("duel_results")
      .select("*")
      .eq("room_code", r.code)
      .eq("q_index", r.current_q)
      .maybeSingle();

    if (existingResult) {
      setResult(existingResult);
      return;
    }

    const now = Date.now();
    const started = r.round_started_at
      ? new Date(r.round_started_at).getTime()
      : 0;

    if (now - started > ROUND_TIMEOUT) {
      await finalizeTimeout(r, question, subs || []);
    }
  }

  async function finalizeTimeout(
    r: DuelRoom,
    question: DuelQuestion,
    subs: DuelSubmission[]
  ) {
    let winner: "A" | "B";

    if (subs.length === 0) {
      winner = Math.random() < 0.5 ? "A" : "B";
    } else if (subs.length === 1) {
      winner = subs[0].slot;
    } else {
      const a = subs.find(s => s.slot === "A")!;
      const b = subs.find(s => s.slot === "B")!;
      const diffA = Math.abs(a.guess - question.a);
      const diffB = Math.abs(b.guess - question.a);

      if (diffA < diffB) winner = "A";
      else if (diffB < diffA) winner = "B";
      else {
        winner =
          new Date(a.submitted_at).getTime() <
          new Date(b.submitted_at).getTime()
            ? "A"
            : "B";
      }

      await supabase.from("duel_results").insert({
        room_code: r.code,
        q_index: r.current_q,
        winner,
        p1_diff: diffA,
        p2_diff: diffB,
      });

      return;
    }

    await supabase.from("duel_results").insert({
      room_code: r.code,
      q_index: r.current_q,
      winner,
      p1_diff: null,
      p2_diff: null,
    });
  }

  async function submit() {
    if (!room || !mySlot) return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(guess),
    });
  }

  const question =
    room && room.status === "playing"
      ? questionMap.get(room.question_ids[room.current_q])
      : null;

  return (
    <main style={{ padding: 40, color: "white", background: "#111", minHeight: "100vh" }}>
      <h1>Duel</h1>

      {!room && (
        <>
          <button onClick={createRoom}>Create Room</button>
          <input
            value={roomInput}
            onChange={e => setRoomInput(e.target.value)}
            placeholder="Room code"
          />
          <button onClick={joinRoom}>Join</button>
        </>
      )}

      {room && (
        <>
          <h2>Room: {room.code}</h2>
          <div>Status: {room.status}</div>

          {question && (
            <>
              <h3>{question.q}</h3>
              <input
                value={guess}
                onChange={e => setGuess(e.target.value)}
              />
              <button onClick={submit}>Submit</button>
            </>
          )}

          {result && (
            <h2>Winner: {result.winner}</h2>
          )}
        </>
      )}
    </main>
  );
}
