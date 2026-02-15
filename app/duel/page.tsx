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
  round_started_at: string | null;
};

type Player = {
  room_code: string;
  player_token: string;
  slot: "A" | "B";
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
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [guess, setGuess] = useState("");
  const [countdown, setCountdown] = useState(10);
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

    const { data: existing } = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    if (existing?.length === 1) {
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

    // AUTO START
    if (r.status === "waiting" && p?.length === 2) {
      const chosen = (duelQuestions as DuelQuestion[])
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(q => q.id);

      await supabase.from("duel_rooms").update({
        status: "playing",
        question_ids: chosen,
        current_q: 0,
        round_started_at: new Date().toISOString(),
      }).eq("code", r.code);

      return;
    }

    // COUNTDOWN
    if (r.status === "playing" && r.round_started_at) {
      const started = new Date(r.round_started_at).getTime();
      const now = Date.now();
      const elapsed = now - started;
      const left = Math.max(0, 10 - Math.floor(elapsed / 1000));
      setCountdown(left);

      if (elapsed > ROUND_TIMEOUT) {
        await finalizeTimeout(r);
      }
    }
  }

  async function finalizeTimeout(r: Room) {
    const qId = r.question_ids[r.current_q];
    const question = questionMap.get(qId);
    if (!question) return;

    const { data: subs } = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", r.code)
      .eq("q_index", r.current_q);

    let winner: "A" | "B";

    if (!subs || subs.length === 0) {
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
    }

    await supabase.from("duel_results").insert({
      room_code: r.code,
      q_index: r.current_q,
      winner,
    });

    if (r.current_q >= 2) {
      await supabase.from("duel_rooms").update({
        status: "finished"
      }).eq("code", r.code);
    } else {
      await supabase.from("duel_rooms").update({
        current_q: r.current_q + 1,
        round_started_at: new Date().toISOString()
      }).eq("code", r.code);
    }
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

  const currentQuestion =
    room?.status === "playing"
      ? questionMap.get(room.question_ids[room.current_q])
      : null;

  return (
    <main style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "white",
      padding: 40,
      fontFamily: "system-ui"
    }}>
      <h1>Duel</h1>

      {!room && (
        <>
          <button onClick={createRoom}>Create Room</button>
          <input
            value={roomInput}
            onChange={e => setRoomInput(e.target.value)}
            placeholder="Enter room code"
          />
          <button onClick={joinRoom}>Join</button>
        </>
      )}

      {room && (
        <>
          <h2>Room: {room.code}</h2>
          <div>Status: {room.status}</div>

          {room.status === "waiting" && (
            <div>Waiting for opponent...</div>
          )}

          {currentQuestion && (
            <>
              <h3>{currentQuestion.q}</h3>
              <div>Time left: {countdown}s</div>
              <input
                value={guess}
                onChange={e => setGuess(e.target.value)}
              />
              <button onClick={submit}>Submit</button>
            </>
          )}
        </>
      )}
    </main>
  );
}
