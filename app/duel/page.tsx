"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  code: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
  round_active: boolean;
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

  /* ---------------- CREATE ROOM ---------------- */

  async function createRoom() {
    const code = randomCode();

    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: [],
      round_active: false
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
      round_active: false
    });

    setMySlot("A");
    startPolling(code);
  }

  /* ---------------- JOIN ROOM ---------------- */

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

      if (data.status === "finished") {
        stopTimer();
        return;
      }

      if (data.round_active && timer === null) {
        startTimer();
      }

      if (!data.round_active && timer !== null) {
        stopTimer();
        await loadRoundResult(code, data.current_q - 1);
      }

      // 🔥 AUTO EVALUATE HA 2 SUBMISSION MEGVAN
      const { count } = await supabase
        .from("duel_submissions")
        .select("*", { count: "exact", head: true })
        .eq("room_code", code)
        .eq("q_index", data.current_q);

      if (count === 2 && data.round_active) {
        await evaluateRound(code);
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
          if (room) evaluateRound(room.code);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimer(null);
  }

  /* ---------------- EVALUATE ---------------- */

  async function evaluateRound(code: string) {
    await supabase.rpc("evaluate_duel_round", {
      room_code_input: code
    });
  }

  /* ---------------- SUBMIT ---------------- */

  async function submitGuess() {
    if (!room || !mySlot || locked || !guess) return;

    const responseTime = 10 - (timer ?? 0);

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(guess),
      response_time: responseTime
    });

    setLocked(true);
    setGuess("");
  }

  /* ---------------- LOAD RESULT ---------------- */

  async function loadRoundResult(code: string, roundIndex: number) {
    const { data } = await supabase
      .from("duel_round_results")
      .select("*")
      .eq("room_code", code)
      .eq("round_index", roundIndex)
      .single();

    if (data) {
      setRoundResult(data.winner_slot ?? "Draw");
    }
  }

  /* ---------------- START GAME ---------------- */

  async function startGame() {
    if (!room) return;

    await supabase
      .from("duel_rooms")
      .update({
        status: "playing",
        round_active: true
      })
      .eq("code", room.code);
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h1>Duel Engine</h1>

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
              {timer !== null && <p>Time left: {timer}</p>}
              {timer === 0 && <p>Time is up</p>}

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
                <h3>
                  {roundResult === "Draw"
                    ? "Draw"
                    : `Winner: ${roundResult}`}
                </h3>
              )}
            </>
          )}

          {room.status === "finished" && (
            <h2>Duel finished</h2>
          )}
        </>
      )}
    </div>
  );
}
