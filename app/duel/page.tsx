"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  code: string;
  status: "waiting" | "playing";
  current_q: number;
};

const CORRECT_ANSWER = 100;

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

  const [roundResult, setRoundResult] = useState<any>(null);

  const pollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const previousStatusRef = useRef<string | null>(null);

  /* ---------------- CREATE ROOM ---------------- */

  async function createRoom() {
    const code = randomCode();

    const { error: roomError } = await supabase
      .from("duel_rooms")
      .insert({
        code,
        status: "waiting",
        current_q: 0,
        question_ids: []
      });

    if (roomError) return;

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: crypto.randomUUID(),
      slot: "A"
    });

    setRoom({ code, status: "waiting", current_q: 0 });
    setMySlot("A");
    startPolling(code);
  }

  /* ---------------- JOIN ROOM ---------------- */

  async function joinRoom() {
    const { data, error } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", roomCode)
      .single();

    if (error || !data) return;

    await supabase.from("duel_players").insert({
      room_code: roomCode,
      player_token: crypto.randomUUID(),
      slot: "B"
    });

    setRoom(data);
    setMySlot("B");
    startPolling(roomCode);
  }

  /* ---------------- POLLING ---------------- */

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

      if (
        previousStatusRef.current !== "playing" &&
        data.status === "playing"
      ) {
        startTimer();
      }

      previousStatusRef.current = data.status;

      // -------- CHECK SUBMISSIONS --------

      if (data.status === "playing") {
        const { data: subs } = await supabase
          .from("duel_submissions")
          .select("*")
          .eq("room_code", code)
          .eq("q_index", data.current_q);

        if (subs && subs.length === 2 && !roundResult) {
          evaluateRound(subs);
        }
      }
    }, 1000);
  }

  /* ---------------- TIMER ---------------- */

  function startTimer() {
    if (timerRef.current) return;

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

  /* ---------------- SUBMIT ---------------- */

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

  /* ---------------- ROUND EVALUATION ---------------- */

  function evaluateRound(subs: any[]) {
    clearInterval(timerRef.current);
    setLocked(true);

    const subA = subs.find(s => s.slot === "A");
    const subB = subs.find(s => s.slot === "B");

    const distA = Math.abs(subA.guess - CORRECT_ANSWER);
    const distB = Math.abs(subB.guess - CORRECT_ANSWER);

    let winner: "A" | "B" | "draw" = "draw";

    if (distA < distB) winner = "A";
    else if (distB < distA) winner = "B";
    else {
      if (subA.response_time < subB.response_time) winner = "A";
      else if (subB.response_time < subA.response_time) winner = "B";
    }

    setRoundResult({
      guessA: subA.guess,
      guessB: subB.guess,
      timeA: subA.response_time,
      timeB: subB.response_time,
      winner
    });
  }

  /* ---------------- START GAME ---------------- */

  async function startGame() {
    if (!room) return;

    await supabase
      .from("duel_rooms")
      .update({ status: "playing" })
      .eq("code", room.code);
  }

  /* ---------------- CLEANUP ---------------- */

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* ---------------- UI ---------------- */

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

              {roundResult && (
                <div style={{ marginTop: 20 }}>
                  <p>A guessed: {roundResult.guessA} ({roundResult.timeA}s)</p>
                  <p>B guessed: {roundResult.guessB} ({roundResult.timeB}s)</p>
                  <h3>Winner: {roundResult.winner}</h3>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
