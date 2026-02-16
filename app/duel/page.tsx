"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";

type Room = {
  code: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
  question_ids: string[];
  score_a: number;
  score_b: number;
  round_locked: boolean;
};

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function DuelPage() {
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);

  const [timer, setTimer] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [guess, setGuess] = useState("");
  const [roundResult, setRoundResult] = useState<string | null>(null);

  const pollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const questionsMap = useMemo(() => {
    const map = new Map();
    (duelQuestions as any[]).forEach(q => map.set(q.id, q));
    return map;
  }, []);

  /* ================= CREATE ROOM ================= */

  async function createRoom() {
    const code = randomCode();

    const shuffled = [...(duelQuestions as any[])]
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map(q => q.id);

    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: shuffled,
      score_a: 0,
      score_b: 0,
      round_locked: false
    });

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: crypto.randomUUID(),
      slot: "A"
    });

    setRoom({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: shuffled,
      score_a: 0,
      score_b: 0,
      round_locked: false
    });

    setMySlot("A");
    startPolling(code);
  }

  /* ================= JOIN ROOM ================= */

  async function joinRoom() {
    const { data } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", roomCode)
      .single();

    if (!data) return;

    await supabase.from("duel_players").insert({
      room_code: roomCode,
      player_token: crypto.randomUUID(),
      slot: "B"
    });

    setRoom(data);
    setMySlot("B");
    startPolling(roomCode);
  }

  /* ================= POLLING ================= */

  function startPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("duel_rooms")
        .select("*")
        .eq("code", code)
        .single();

      if (!data) return;

      setRoom(data);

      if (data.status === "playing" && timer === null) {
        startTimer();
      }

      // 🔥 ONLY PLAYER A EVALUATES
      if (!data.round_locked && mySlot === "A") {
        evaluateRound(data);
      }

      if (data.status === "finished") {
        setLocked(true);
        setTimer(null);
      }
    }, 1000);
  }

  /* ================= TIMER ================= */

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);

    setTimer(10);
    setLocked(false);
    setRoundResult(null);

    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev === null) return null;

        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setLocked(true);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  }

  /* ================= SUBMIT ================= */

  async function submitGuess() {
    if (!room || !mySlot || !guess || locked) return;

    const responseTime = 10 - (timer ?? 0);

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(guess),
      response_time: responseTime
    });

    setGuess("");
  }

  /* ================= EVALUATION ================= */

  async function evaluateRound(r: Room) {
    await supabase
      .from("duel_rooms")
      .update({ round_locked: true })
      .eq("code", r.code);

    const { data: subs } = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", r.code)
      .eq("q_index", r.current_q);

    const q = questionsMap.get(r.question_ids[r.current_q]);
    const answer = q.a;

    const subA = subs?.find(s => s.slot === "A");
    const subB = subs?.find(s => s.slot === "B");

    let winner: "A" | "B" | "DRAW" = "DRAW";

    if (!subA && subB) winner = "B";
    else if (!subB && subA) winner = "A";
    else if (subA && subB) {
      const diffA = Math.abs(subA.guess - answer);
      const diffB = Math.abs(subB.guess - answer);

      if (diffA < diffB) winner = "A";
      else if (diffB < diffA) winner = "B";
      else {
        if (subA.response_time < subB.response_time) winner = "A";
        else if (subB.response_time < subA.response_time) winner = "B";
      }
    }

    let scoreA = r.score_a;
    let scoreB = r.score_b;

    if (winner === "A") scoreA++;
    if (winner === "B") scoreB++;

    setRoundResult(`Winner: ${winner}`);

    setTimeout(async () => {
      if (r.current_q >= 2) {
        await supabase
          .from("duel_rooms")
          .update({
            status: "finished",
            score_a: scoreA,
            score_b: scoreB
          })
          .eq("code", r.code);
      } else {
        await supabase
          .from("duel_rooms")
          .update({
            current_q: r.current_q + 1,
            score_a: scoreA,
            score_b: scoreB,
            round_locked: false
          })
          .eq("code", r.code);

        startTimer();
      }
    }, 3000);
  }

  /* ================= START GAME ================= */

  async function startGame() {
    if (!room) return;

    await supabase
      .from("duel_rooms")
      .update({ status: "playing" })
      .eq("code", room.code);
  }

  /* ================= CLEANUP ================= */

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* ================= UI ================= */

  return (
    <div style={{ padding: 40 }}>
      <h1>Duel</h1>

      {!room && (
        <>
          <button onClick={createRoom}>Create Room</button>
          <br /><br />
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Room code"
          />
          <button onClick={joinRoom}>Join Room</button>
        </>
      )}

      {room && (
        <>
          <p>Room: {room.code}</p>
          <p>Status: {room.status}</p>
          <p>You are Player {mySlot}</p>
          <p>Score A: {room.score_a}</p>
          <p>Score B: {room.score_b}</p>

          {room.status === "waiting" && mySlot === "A" && (
            <button onClick={startGame}>Start Game</button>
          )}

          {room.status === "playing" && (
            <>
              <h2>{timer !== null ? `Time left: ${timer}` : ""}</h2>
              {locked && <p>Time is up</p>}
              {roundResult && <h3>{roundResult}</h3>}

              <input
                type="number"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                disabled={locked}
                placeholder="Your guess"
              />
              <button onClick={submitGuess} disabled={locked}>
                Submit
              </button>
            </>
          )}

          {room.status === "finished" && (
            <>
              <h2>Duel Finished</h2>
              {room.score_a > room.score_b && (
                <p>Player A wins. Move forward 3 spaces.</p>
              )}
              {room.score_b > room.score_a && (
                <p>Player B wins. Move forward 3 spaces.</p>
              )}
              {room.score_a === room.score_b && (
                <p>Draw. Both move forward 1 space.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
