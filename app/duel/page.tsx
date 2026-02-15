"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";

type DuelRoom = {
  code: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
  question_ids: string[];
};

type DuelPlayer = {
  player_token: string;
  slot: "A" | "B";
};

type Submission = {
  slot: "A" | "B";
  guess: number;
  submitted_at: string;
};

type ResultRow = {
  winner: "A" | "B";
  p1_diff: number | null;
  p2_diff: number | null;
};

const ROUND_TIME = 10000;

function abs(n: number) {
  return n < 0 ? -n : n;
}

function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function getToken(roomCode: string) {
  const key = `duel_token_${roomCode}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const t = crypto.randomUUID();
  localStorage.setItem(key, t);
  return t;
}

export default function DuelPage() {
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState<DuelRoom | null>(null);
  const [players, setPlayers] = useState<DuelPlayer[]>([]);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [myGuess, setMyGuess] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [roundResult, setRoundResult] = useState<ResultRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const roundStartRef = useRef<number>(Date.now());

  const questionMap = useMemo(() => {
    const m = new Map<string, any>();
    duelQuestions.forEach((q: any) => m.set(q.id, q));
    return m;
  }, []);

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
  }

  function startPolling(code: string) {
    stopPolling();
    pollRef.current = window.setInterval(() => refresh(code), 700);
  }

  async function refresh(code: string) {
    const roomRes = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!roomRes.data) return;

    setRoom(roomRes.data);

    const playersRes = await supabase
      .from("duel_players")
      .select("player_token,slot")
      .eq("room_code", code);

    setPlayers(playersRes.data || []);

    const subsRes = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", code)
      .eq("q_index", roomRes.data.current_q);

    setSubmissions(subsRes.data || []);

    await handleFinalize(roomRes.data);
  }

  async function handleFinalize(currentRoom: DuelRoom) {
    if (currentRoom.status !== "playing") return;

    const now = Date.now();
    const elapsed = now - roundStartRef.current;

    const qId = currentRoom.question_ids[currentRoom.current_q];
    const q = questionMap.get(qId);
    if (!q) return;

    const subA = submissions.find((s) => s.slot === "A");
    const subB = submissions.find((s) => s.slot === "B");

    const bothSubmitted = subA && subB;
    const timeout = elapsed >= ROUND_TIME;

    if (!bothSubmitted && !timeout) return;

    let winner: "A" | "B";
    let diffA: number | null = null;
    let diffB: number | null = null;

    if (subA && subB) {
      diffA = abs(subA.guess - q.a);
      diffB = abs(subB.guess - q.a);

      if (diffA < diffB) winner = "A";
      else if (diffB < diffA) winner = "B";
      else {
        winner =
          new Date(subA.submitted_at).getTime() <
          new Date(subB.submitted_at).getTime()
            ? "A"
            : "B";
      }
    } else if (subA && !subB) {
      winner = "A";
    } else if (!subA && subB) {
      winner = "B";
    } else {
      winner = Math.random() < 0.5 ? "A" : "B";
    }

    const resultRow = {
      room_code: currentRoom.code,
      q_index: currentRoom.current_q,
      answer: q.a,
      p1_guess: subA?.guess ?? null,
      p2_guess: subB?.guess ?? null,
      p1_diff: diffA,
      p2_diff: diffB,
      winner,
    };

    await supabase.from("duel_results").insert(resultRow);

    setRoundResult({
      winner,
      p1_diff: diffA,
      p2_diff: diffB,
    });

    if (currentRoom.current_q >= 2) {
      await supabase
        .from("duel_rooms")
        .update({ status: "finished" })
        .eq("code", currentRoom.code);
    } else {
      await supabase
        .from("duel_rooms")
        .update({ current_q: currentRoom.current_q + 1 })
        .eq("code", currentRoom.code);

      roundStartRef.current = Date.now();
      setMyGuess("");
      setRoundResult(null);
    }
  }

  async function createRoom() {
    const code = randomCode();
    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: duelQuestions
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map((q: any) => q.id),
    });

    const token = getToken(code);
    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "A",
    });

    setRoomCodeInput(code);
    await refresh(code);
    startPolling(code);
  }

  async function joinRoom() {
    const code = roomCodeInput.trim().toUpperCase();
    const token = getToken(code);

    const playersRes = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    if ((playersRes.data || []).length >= 2) {
      setError("Room full");
      return;
    }

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "B",
    });

    await supabase
      .from("duel_rooms")
      .update({ status: "playing" })
      .eq("code", code);

    roundStartRef.current = Date.now();

    await refresh(code);
    startPolling(code);
  }

  async function submitGuess() {
    if (!room || !mySlot) return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(myGuess, 10),
    });

    setMyGuess("");
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Duel</h1>

      <button onClick={createRoom}>Create Room</button>

      <input
        value={roomCodeInput}
        onChange={(e) => setRoomCodeInput(e.target.value)}
        placeholder="Room code"
      />

      <button onClick={joinRoom}>Join</button>

      {room && (
        <div>
          <h2>Status: {room.status}</h2>
          {room.status === "playing" && (
            <>
              <p>
                {
                  questionMap.get(
                    room.question_ids[room.current_q]
                  )?.q
                }
              </p>

              <input
                value={myGuess}
                onChange={(e) => setMyGuess(e.target.value)}
                placeholder="Your guess"
              />
              <button onClick={submitGuess}>Submit</button>
            </>
          )}

          {roundResult && (
            <p>Round winner: {roundResult.winner}</p>
          )}
        </div>
      )}
    </main>
  );
}
