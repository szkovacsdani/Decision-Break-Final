"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  code: string;
  status: "waiting" | "playing";
  current_q: number;
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

  const pollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const previousStatusRef = useRef<string | null>(null);

  /* ---------------- CREATE ROOM ---------------- */

  async function createRoom() {
    const code = randomCode();

    console.log("Creating room:", code);

    const { error: roomError } = await supabase
      .from("duel_rooms")
      .insert({
        code,
        status: "waiting",
        current_q: 0,
        question_ids: []
      });

    if (roomError) {
      console.log("ROOM INSERT ERROR:", roomError);
      return;
    }

    const { error: playerError } = await supabase
      .from("duel_players")
      .insert({
        room_code: code,
        player_token: crypto.randomUUID(),
        slot: "A"
      });

    if (playerError) {
      console.log("PLAYER INSERT ERROR:", playerError);
      return;
    }

    console.log("ROOM CREATED SUCCESS");

    setRoom({ code, status: "waiting", current_q: 0 });
    setMySlot("A");
    startPolling(code);
  }

  /* ---------------- JOIN ROOM ---------------- */

  async function joinRoom() {
    console.log("Joining room:", roomCode);

    const { data, error } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", roomCode)
      .single();

    if (error || !data) {
      console.log("ROOM NOT FOUND:", error);
      return;
    }

    const { error: playerError } = await supabase
      .from("duel_players")
      .insert({
        room_code: roomCode,
        player_token: crypto.randomUUID(),
        slot: "B"
      });

    if (playerError) {
      console.log("JOIN PLAYER ERROR:", playerError);
      return;
    }

    console.log("JOIN SUCCESS");

    setRoom(data);
    setMySlot("B");
    startPolling(roomCode);
  }

  /* ---------------- POLLING ---------------- */

  function startPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      const { data, error } = await supabase
        .from("duel_rooms")
        .select("*")
        .eq("code", code)
        .single();

      if (error) {
        console.log("POLL ERROR:", error);
        return;
      }

      if (!data) return;

      setRoom(data);

      if (
        previousStatusRef.current !== "playing" &&
        data.status === "playing"
      ) {
        startTimer();
      }

      previousStatusRef.current = data.status;
    }, 1000);
  }

  /* ---------------- TIMER ---------------- */

  function startTimer() {
    if (timerRef.current) return;

    console.log("TIMER STARTED");

    setTimer(10);
    setLocked(false);

    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev === null) return null;

        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;

          console.log("TIMER ENDED");

          setLocked(true);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  }

  /* ---------------- SUBMIT GUESS ---------------- */

  async function submitGuess() {
    if (!room || !mySlot || !guess || locked) return;

    const responseTime = 10 - (timer ?? 0);

    console.log("Submitting guess:", {
      room: room.code,
      slot: mySlot,
      guess,
      responseTime
    });

    const { error } = await supabase
      .from("duel_submissions")
      .insert({
        room_code: room.code,
        q_index: room.current_q,
        slot: mySlot,
        guess: parseInt(guess),
        response_time: responseTime
      });

    if (error) {
      console.log("SUBMISSION ERROR:", error);
      return;
    }

    console.log("SUBMISSION SUCCESS");

    setLocked(true);
    setGuess("");
  }

  /* ---------------- START GAME ---------------- */

  async function startGame() {
    if (!room) return;

    console.log("Starting game");

    const { error } = await supabase
      .from("duel_rooms")
      .update({ status: "playing" })
      .eq("code", room.code);

    if (error) {
      console.log("START GAME ERROR:", error);
    }
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
      <h1>Duel Debug Version</h1>

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
              <h2>
                {timer !== null ? `Time left: ${timer}` : ""}
              </h2>

              {locked && <p>Locked</p>}

              <br />

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
        </>
      )}
    </div>
  );
}
