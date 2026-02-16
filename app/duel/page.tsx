"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  code: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
  question_ids: number[];
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

function shuffle(array: number[]) {
  return array.sort(() => 0.5 - Math.random());
}

export default function DuelPage() {
  const [room, setRoom] = useState<Room | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);

  const [timer, setTimer] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [guess, setGuess] = useState("");
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [roundResult, setRoundResult] = useState<string | null>(null);

  const pollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  /* CREATE */

  async function createRoom() {
    const code = randomCode();
    const questionPool = shuffle([...Array(1000)].map((_, i) => i + 1)).slice(0, 3);

    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: questionPool,
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
      question_ids: questionPool,
      round_locked: false
    });

    setMySlot("A");
    startPolling(code);
  }

  /* JOIN */

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

  /* POLL */

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

      if (data.status === "playing" && timerRef.current === null) {
        startTimer();
      }

      if (!data.round_locked) {
        checkRound(data);
      }
    }, 1000);
  }

  /* TIMER */

  function startTimer() {
    clearInterval(timerRef.current);

    setTimer(10);
    setLocked(false);
    setRoundResult(null);

    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev === null) return null;

        if (prev <= 1) {
          clearInterval(timerRef.current);
          setLocked(true);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  }

  /* SUBMIT */

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

  /* ROUND LOGIC */

  async function checkRound(data: Room) {
    const { data: submissions } = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", data.code)
      .eq("q_index", data.current_q);

    const bothSubmitted = submissions && submissions.length === 2;
    const timeExpired = locked;

    if (!bothSubmitted && !timeExpired) return;

    await supabase
      .from("duel_rooms")
      .update({ round_locked: true })
      .eq("code", data.code);

    let winner: "A" | "B" | "DRAW" = "DRAW";

    if (bothSubmitted) {
      const A = submissions.find(s => s.slot === "A");
      const B = submissions.find(s => s.slot === "B");

      const correct = 100;

      const diffA = Math.abs(A.guess - correct);
      const diffB = Math.abs(B.guess - correct);

      if (diffA < diffB) winner = "A";
      else if (diffB < diffA) winner = "B";
      else {
        if (A.response_time < B.response_time) winner = "A";
        else if (B.response_time < A.response_time) winner = "B";
      }
    }

    if (winner === "A") setScoreA(s => s + 1);
    if (winner === "B") setScoreB(s => s + 1);
    if (winner === "DRAW") {
      setScoreA(s => s + 1);
      setScoreB(s => s + 1);
    }

    setRoundResult(winner);

    setTimeout(async () => {
      if (data.current_q < 2) {
        await supabase
          .from("duel_rooms")
          .update({
            current_q: data.current_q + 1,
            round_locked: false
          })
          .eq("code", data.code);

        startTimer();
      } else {
        await supabase
          .from("duel_rooms")
          .update({ status: "finished" })
          .eq("code", data.code);
      }
    }, 3000);
  }

  /* START */

  async function startGame() {
    if (!room) return;

    await supabase
      .from("duel_rooms")
      .update({ status: "playing" })
      .eq("code", room.code);
  }

  /* CLEANUP */

  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
  }, []);

  /* UI */

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
          />
          <button onClick={joinRoom}>Join Room</button>
        </>
      )}

      {room && (
        <>
          <p>Room: {room.code}</p>
          <p>Status: {room.status}</p>
          <p>You are Player {mySlot}</p>

          <p>Score A: {scoreA}</p>
          <p>Score B: {scoreB}</p>

          {room.status === "waiting" && mySlot === "A" && (
            <button onClick={startGame}>Start Game</button>
          )}

          {room.status === "playing" && (
            <>
              <h2>{timer !== null ? `Time left: ${timer}` : ""}</h2>
              {locked && <p>Time is up</p>}

              <input
                type="number"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                disabled={locked}
              />

              <button onClick={submitGuess} disabled={locked}>
                Submit
              </button>

              {roundResult && <h3>Round result: {roundResult}</h3>}
            </>
          )}

          {room.status === "finished" && (
            <>
              <h2>Duel Finished</h2>
              <h3>
                {scoreA > scoreB
                  ? "Player A Wins"
                  : scoreB > scoreA
                  ? "Player B Wins"
                  : "Draw"}
              </h3>
            </>
          )}
        </>
      )}
    </div>
  );
}
