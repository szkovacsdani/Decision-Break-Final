"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";

type Question = {
  id: string;
  q: string;
  a: number;
  unit?: string;
};

type Submission = {
  slot: "A" | "B";
  guess: number;
  submitted_at: string;
  response_ms: number;
};

function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function DuelPage() {
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<any>(null);
  const [slot, setSlot] = useState<"A" | "B" | null>(null);
  const [guess, setGuess] = useState("");
  const [locked, setLocked] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [duelResult, setDuelResult] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [roundStart, setRoundStart] = useState<number | null>(null);

  const pollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const questionMap = useMemo(() => {
    const map = new Map<string, Question>();
    (duelQuestions as Question[]).forEach(q => map.set(q.id, q));
    return map;
  }, []);

  const currentQuestion =
    room?.question_ids?.length === 3
      ? questionMap.get(room.question_ids[room.current_q])
      : null;

  // ---------- ROOM CREATION ----------
  async function createRoom() {
    const code = randomCode();
    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: [],
    });

    await supabase.from("duel_players").insert({
      room_code: code,
      slot: "A",
      player_token: crypto.randomUUID(),
    });

    setSlot("A");
    setRoomCode(code);
    startPolling(code);
  }

  async function joinRoom() {
    const code = roomCode.trim().toUpperCase();

    const { data } = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    if (data && data.length < 2) {
      await supabase.from("duel_players").insert({
        room_code: code,
        slot: "B",
        player_token: crypto.randomUUID(),
      });

      setSlot("B");
      startPolling(code);
    }
  }

  // ---------- POLLING ----------
  function startPolling(code: string) {
    stopPolling();
    refresh(code);
    pollRef.current = setInterval(() => refresh(code), 800);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
  }

  async function refresh(code: string) {
    const { data: r } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", code)
      .single();

    if (!r) return;

    setRoom(r);

    if (r.status === "playing") {
      const { data: subs } = await supabase
        .from("duel_submissions")
        .select("*")
        .eq("room_code", code)
        .eq("q_index", r.current_q);

      setSubmissions(subs || []);
    }

    if (r.status === "finished") {
      calculateFinal(r.code);
    }
  }

  // ---------- COUNTDOWN ----------
  useEffect(() => {
    if (room?.status !== "playing") return;

    setTimeLeft(10);
    setRoundStart(Date.now());
    setLocked(false);
    setRoundResult(null);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [room?.current_q]);

  // ---------- AUTO RESULT IF BOTH SUBMITTED ----------
  useEffect(() => {
    if (submissions.length === 2 && !roundResult) {
      clearInterval(timerRef.current);
      evaluateRound();
    }
  }, [submissions]);

  async function submitGuess() {
    if (!room || locked) return;

    const number = parseInt(guess);
    if (!Number.isFinite(number)) return;

    const response_ms = Date.now() - (roundStart || Date.now());

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot,
      guess: number,
      response_ms,
    });

    setLocked(true);
  }

  async function evaluateRound() {
    const q = currentQuestion;
    if (!q) return;

    const A = submissions.find(s => s.slot === "A");
    const B = submissions.find(s => s.slot === "B");

    if (!A || !B) return;

    const diffA = Math.abs(A.guess - q.a);
    const diffB = Math.abs(B.guess - q.a);

    let winner: "A" | "B";

    if (diffA < diffB) winner = "A";
    else if (diffB < diffA) winner = "B";
    else winner = A.response_ms <= B.response_ms ? "A" : "B";

    setRoundResult({
      winner,
      A,
      B,
      correct: q.a,
      diffA,
      diffB,
    });

    setTimeout(() => nextRound(winner), 5000);
  }

  async function nextRound(winner: "A" | "B") {
    if (room.current_q >= 2) {
      await supabase
        .from("duel_rooms")
        .update({ status: "finished" })
        .eq("code", room.code);
      return;
    }

    await supabase
      .from("duel_rooms")
      .update({ current_q: room.current_q + 1 })
      .eq("code", room.code);

    setGuess("");
  }

  async function calculateFinal(code: string) {
    const { data } = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", code);

    if (!data) return;

    let winsA = 0;
    let winsB = 0;

    for (let i = 0; i < 3; i++) {
      const roundSubs = data.filter(d => d.q_index === i);
      if (roundSubs.length < 2) continue;

      const q = questionMap.get(room.question_ids[i]);
      const A = roundSubs.find(s => s.slot === "A");
      const B = roundSubs.find(s => s.slot === "B");

      if (!A || !B || !q) continue;

      const diffA = Math.abs(A.guess - q.a);
      const diffB = Math.abs(B.guess - q.a);

      if (diffA < diffB) winsA++;
      else if (diffB < diffA) winsB++;
      else winsA++;
    }

    const winner = winsA > winsB ? "A" : "B";

    let winnerMove = winsA === 3 || winsB === 3 ? 3 : 2;
    let loserMove = winsA === 3 || winsB === 3 ? -1 : 0;

    setDuelResult({
      winsA,
      winsB,
      winner,
      winnerMove,
      loserMove,
    });
  }

  return (
    <main style={{ padding: 30, background: "#000", color: "white", minHeight: "100vh" }}>
      <h1>Duel</h1>

      {!room && (
        <>
          <button onClick={createRoom}>Create Room</button>
          <input
            value={roomCode}
            onChange={e => setRoomCode(e.target.value)}
            placeholder="Enter room code"
          />
          <button onClick={joinRoom}>Join</button>
        </>
      )}

      {room && (
        <>
          <h2>Room: {room.code}</h2>
          <p>Status: {room.status}</p>
          <p>You are Player {slot}</p>

          {room.status === "playing" && currentQuestion && (
            <>
              <h3>{currentQuestion.q}</h3>
              <p>Time left: {timeLeft}s</p>

              {!roundResult && (
                <>
                  <input
                    value={guess}
                    onChange={e => setGuess(e.target.value)}
                    disabled={locked}
                  />
                  <button onClick={submitGuess} disabled={locked}>
                    Submit
                  </button>
                </>
              )}

              {roundResult && (
                <>
                  <h3>Round Result</h3>
                  <p>Correct answer: {roundResult.correct}</p>
                  <p>
                    A guessed {roundResult.A.guess} ({roundResult.A.response_ms}ms)
                  </p>
                  <p>
                    B guessed {roundResult.B.guess} ({roundResult.B.response_ms}ms)
                  </p>
                  <p>Winner: {roundResult.winner}</p>
                </>
              )}
            </>
          )}

          {duelResult && (
            <>
              <h2>Duel Finished</h2>
              <p>Rounds won: A {duelResult.winsA} | B {duelResult.winsB}</p>
              <p>Winner: Player {duelResult.winner}</p>
              <p>
                Winner moves forward {duelResult.winnerMove} spaces.
              </p>
              <p>
                Loser {duelResult.loserMove === 0
                  ? "stays in place."
                  : "moves back 1 space."}
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}
