"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function DuelRoom() {
  const [roomCode, setRoomCode] = useState("");
  const [duelId, setDuelId] = useState<string | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [round, setRound] = useState<any>(null);
  const [guess, setGuess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCreator, setIsCreator] = useState(false);

  // ---------------- FETCH PLAYERS
  async function fetchPlayers(id: string) {
    const { data } = await supabase
      .from("db_duel_players")
      .select("*")
      .eq("duel_id", id)
      .order("slot");

    setPlayers(data || []);
  }

  // ---------------- FETCH ROUND
  async function fetchRound(id: string) {
    const { data } = await supabase
      .from("db_duel_rounds")
      .select("*")
      .eq("duel_id", id)
      .eq("status", "active")
      .limit(1);

    if (data && data.length > 0) {
      setRound(data[0]);
    } else {
      setRound(null);
    }
  }

  // ---------------- CREATE ROOM
  async function createRoom() {
    const code = generateCode();

    const { data, error } = await supabase
      .from("db_duels")
      .insert({
        status: "waiting",
        current_round: 0,
        room_code: code,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setRoomCode(code);
    setDuelId(data.id);
    setIsCreator(true);

    await join(data.id);
  }

  // ---------------- JOIN BY CODE
  async function joinByCode() {
    const { data, error } = await supabase
      .from("db_duels")
      .select("*")
      .eq("room_code", roomCode)
      .single();

    if (error || !data) {
      console.error("Room not found");
      return;
    }

    setDuelId(data.id);
    await join(data.id);
  }

  // ---------------- JOIN SLOT
  async function join(id: string) {
    const { data } = await supabase
      .from("db_duel_players")
      .select("*")
      .eq("duel_id", id);

    const slots = data?.map((p) => p.slot) || [];

    let slot: "A" | "B" | null = null;

    if (!slots.includes("A")) slot = "A";
    else if (!slots.includes("B")) slot = "B";

    if (!slot) return;

    const { error } = await supabase.from("db_duel_players").insert({
      duel_id: id,
      player_token: crypto.randomUUID(),
      slot,
    });

    if (error) {
      console.error(error);
      return;
    }

    await fetchPlayers(id);
  }

  // ---------------- START ROUND
  async function startRound() {
    if (!duelId || players.length < 2) return;

    const { error } = await supabase.rpc("db_start_round", {
      p_duel_id: duelId,
      p_question_id: "Q1",
      p_duration: 10,
    });

    if (error) {
      console.error(error);
    }
  }

  // ---------------- SUBMIT GUESS
  async function submitGuess(slot: "A" | "B") {
    if (!round || loading) return;

    setLoading(true);

    const { error } = await supabase.from("db_duel_submissions").insert({
      round_id: round.id,
      slot,
      guess: Number(guess),
    });

    if (error) {
      console.error(error);
    }

    setGuess("");
    setLoading(false);
  }

  // ---------------- REALTIME SYNC (DUEL-SCOPED)
  useEffect(() => {
    if (!duelId) return;

    fetchPlayers(duelId);
    fetchRound(duelId);

    const channel = supabase
      .channel(`duel-${duelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "db_duel_players",
          filter: `duel_id=eq.${duelId}`,
        },
        () => fetchPlayers(duelId)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "db_duel_rounds",
          filter: `duel_id=eq.${duelId}`,
        },
        () => fetchRound(duelId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Duel Room Realtime</h1>

      {!duelId && (
        <>
          <button onClick={createRoom}>Create Room</button>

          <div style={{ marginTop: 20 }}>
            <input
              placeholder="Enter Room Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            />
            <button onClick={joinByCode}>Join Room</button>
          </div>
        </>
      )}

      {duelId && (
        <>
          <p>Room Code: {roomCode}</p>

          {isCreator && players.length === 2 && (
            <button onClick={startRound}>Start Duel</button>
          )}

          {round && (
            <>
              <h2>Round {round.round_number}</h2>

              <input
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Enter guess"
              />

              <button disabled={loading} onClick={() => submitGuess("A")}>
                Submit as A
              </button>

              <button disabled={loading} onClick={() => submitGuess("B")}>
                Submit as B
              </button>
            </>
          )}

          <h3>Players</h3>
          {players.map((p) => (
            <div key={p.id}>
              {p.slot}: {p.score}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
