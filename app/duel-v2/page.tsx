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
  const [players, setPlayers] = useState<any[]>([]);

  const [guess, setGuess] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [resolving, setResolving] = useState(false);

  // Reset when round changes
  useEffect(() => {
    setSubmitted(false);
    setGuess("");
    setResolving(false);
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

      const { data: playersData } = await supabase
        .from("duel_players")
        .select("*")
        .eq("duel_id", duelId);

      setPlayers(playersData || []);

      const playerCount = playersData?.length || 0;

      // AUTO START
      if (playerCount === 2 && roomData.status === "waiting") {
        await supabase.rpc("start_duel", {
          p_room_code: roomData.code,
        });
      }

      if (roomData.status === "playing") {
        const { data: roundData } = await supabase
          .from("duel_rounds")
          .select("*")
          .eq("duel_id", duelId)
          .eq("round_index", roomData.current_q)
          .maybeSingle();

        if (!roundData) return;

        setRound(roundData);

        const { data: questionData } = await supabase
          .from("duel_questions")
          .select("question")
          .eq("id", roundData.question_id)
          .single();

        setQuestion(questionData);

        const start = new Date(roundData.started_at).getTime();
        const diff =
          roundData.duration_sec - Math.floor((Date.now() - start) / 1000);

        const timeExpired = Date.now() - start >= roundData.duration_sec * 1000;

        setTimeLeft(diff > 0 ? diff : 0);

        if (!roundData.resolved && !resolving) {
          const { count: submissionCount } = await supabase
            .from("duel_submissions")
            .select("*", { count: "exact", head: true })
            .eq("duel_id", duelId)
            .eq("q_index", roomData.current_q);

          if (submissionCount === 2 || timeExpired) {
            setResolving(true);

            await supabase.rpc("resolve_round", {
              p_duel_id: duelId,
              p_round_index: roomData.current_q,
            });
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [duelId, resolving]);

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

  // SUBMIT
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

  // ENTRY
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

  const playerA = players.find((p) => p.slot === "A");
  const playerB = players.find((p) => p.slot === "B");

  // WAITING
  if (room?.status === "waiting") {
    return (
      <div style={{ padding: 40 }}>
        <h2>Room Code: {room.code}</h2>
        <h3>You are Player {slot}</h3>
        <p>Waiting for opponent...</p>
        <p>Players: {players.length}/2</p>
      </div>
    );
  }

  // PLAYING
  if (room?.status === "playing") {
    const danger = timeLeft <= 3 && !round?.resolved;

    return (
      <div style={{ padding: 40 }}>
        <h3>You are Player {slot}</h3>
        <h2>Round {room.current_q}</h2>

        <div>
          <strong>Score</strong>
          <p>Player A: {playerA?.position || 0}</p>
          <p>Player B: {playerB?.position || 0}</p>
        </div>

        {question && <p>{question.question}</p>}

        {!round?.resolved && (
          <>
            <h1 style={{ color: danger ? "red" : "black" }}>{timeLeft}</h1>

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

        {round?.resolved && (
          <div style={{ marginTop: 20 }}>
            <h3>Round Result</h3>
            <p>Correct answer: {round.correct_answer}</p>
            <p>Player A diff: {round.diff_a}</p>
            <p>Player B diff: {round.diff_b}</p>

            {round.winner_slot === "DRAW" ? (
              <h3>Draw</h3>
            ) : (
              <h3>Winner: Player {round.winner_slot}</h3>
            )}
          </div>
        )}
      </div>
    );
  }

  // FINISHED
  if (room?.status === "finished") {
    const winner =
      (playerA?.position || 0) > (playerB?.position || 0)
        ? "A"
        : (playerB?.position || 0) > (playerA?.position || 0)
        ? "B"
        : "DRAW";

    return (
      <div style={{ padding: 40 }}>
        <h3>You are Player {slot}</h3>
        <h2>Game Finished</h2>

        <p>Player A: {playerA?.position || 0}</p>
        <p>Player B: {playerB?.position || 0}</p>

        {winner === "DRAW" ? <h2>Draw</h2> : <h2>Winner: Player {winner}</h2>}
      </div>
    );
  }

  return null;
}
