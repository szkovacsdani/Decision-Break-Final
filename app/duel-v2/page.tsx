"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function DuelPage() {
  const [duelId, setDuelId] = useState<string | null>(null);
  const [slot, setSlot] = useState<"A" | "B" | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");

  const [room, setRoom] = useState<any>(null);
  const [round, setRound] = useState<any>(null);
  const [question, setQuestion] = useState<any>(null);

  const [playersCount, setPlayersCount] = useState(0);

  const [guess, setGuess] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);

  // Reset guess on new round
  useEffect(() => {
    setSubmitted(false);
    setGuess("");
  }, [room?.current_q]);

  // MAIN POLLING LOOP
  useEffect(() => {
    if (!duelId) return;

    const interval = setInterval(async () => {
      const { data: roomData } = await supabase
        .from("duel_rooms")
        .select("*")
        .eq("id", duelId)
        .single();

      if (!roomData) return;

      setRoom(roomData);

      const { count } = await supabase
        .from("duel_players")
        .select("*", { count: "exact", head: true })
        .eq("duel_id", duelId);

      setPlayersCount(count || 0);

      // AUTO START WHEN 2 PLAYERS
      if (count === 2 && roomData.status === "waiting") {
        await supabase.rpc("start_duel", {
          p_duel_id: duelId,
        });
      }

      // LOAD ROUND DATA
      if (roomData.status === "playing") {
        const { data: roundData } = await supabase
          .from("duel_rounds")
          .select("*")
          .eq("duel_id", duelId)
          .eq("round_index", roomData.current_q)
          .maybeSingle();

        if (roundData) {
          setRound(roundData);

          const { data: questionData } = await supabase
            .from("duel_questions")
            .select("question_text")
            .eq("id", roundData.question_id)
            .single();

          setQuestion(questionData);

          if (!roundData.resolved) {
            const start = new Date(roundData.started_at).getTime();
            const diff =
              roundData.duration_sec -
              Math.floor((Date.now() - start) / 1000);

            setTimeLeft(diff > 0 ? diff : 0);
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [duelId]);

  // CREATE ROOM
  async function createRoom() {
    const code = generateCode();

    const { data } = await supabase
      .from("duel_rooms")
      .insert({
        code,
        status: "waiting",
        current_q: 0,
        question_ids: [],
        round_active: false,
        scored: false,
      })
      .select()
      .single();

    await supabase.from("duel_players").insert({
      duel_id: data.id,
      slot: "A",
      position: 0,
    });

    setDuelId(data.id);
    setSlot("A");
    setRoom(data);
  }

  // JOIN ROOM
  async function joinRoom() {
    const { data } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", roomCodeInput.toUpperCase())
      .single();

    if (!data) {
      alert("Room not found");
      return;
    }

    await supabase.from("duel_players").insert({
      duel_id: data.id,
      slot: "B",
      position: 0,
    });

    setDuelId(data.id);
    setSlot("B");
    setRoom(data);
  }

  // SUBMIT GUESS
  async function submitGuess() {
    if (!duelId || !slot || !guess) return;

    await supabase.from("duel_submissions").insert({
      duel_id: duelId,
      q_index: room.current_q,
      slot,
      guess: Number(guess),
    });

    setSubmitted(true);
  }

  // ---------------- UI STATES ----------------

  // ENTRY STATE
  if (!duelId) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Duel</h1>

        <button onClick={createRoom} style={{ marginBottom: 20 }}>
          Create Room
        </button>

        <div>
          <input
            placeholder="Enter Room Code"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value)}
          />
          <button onClick={joinRoom}>Join</button>
        </div>
      </div>
    );
  }

  // WAITING STATE
  if (room?.status === "waiting") {
    return (
      <div style={{ padding: 40 }}>
        <h2>Room Code: {room.code}</h2>
        <h3>Waiting for opponent...</h3>
        <p>Players: {playersCount}/2</p>
      </div>
    );
  }

  // PLAYING STATE
  if (room?.status === "playing") {
    const danger = timeLeft <= 3 && !round?.resolved;

    return (
      <div style={{ padding: 40 }}>
        <h2>Round {room.current_q}</h2>

        {question && <p>{question.question_text}</p>}

        {!round?.resolved && (
          <>
            <h1 style={{ color: danger ? "red" : "black" }}>
              {timeLeft}
            </h1>

            {!submitted ? (
              <>
                <input
                  type="number"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                />
                <button onClick={submitGuess}>Submit</button>
              </>
            ) : (
              <p>Waiting for opponent...</p>
            )}
          </>
        )}

        {round?.resolved && <h3>Round resolved</h3>}
      </div>
    );
  }

  // FINISHED STATE
  if (room?.status === "finished") {
    return (
      <div style={{ padding: 40 }}>
        <h2>Game Finished</h2>
      </div>
    );
  }

  return null;
}
