"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DuelV2() {
  const searchParams = useSearchParams();
  const duelFromUrl = searchParams.get("duel");

  const [duelId, setDuelId] = useState<string | null>(duelFromUrl);
  const [players, setPlayers] = useState<any[]>([]);
  const [round, setRound] = useState<any>(null);
  const [guess, setGuess] = useState("");
  const [loading, setLoading] = useState(false);

  // -------------------------
  // CREATE DUEL
  // -------------------------
  async function createDuel() {
    const { data, error } = await supabase
      .from("db_duels")
      .insert({ status: "waiting", current_round: 0 })
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }

    const newId = data.id;
    setDuelId(newId);

    window.history.replaceState({}, "", `/duel-v2?duel=${newId}`);
  }

  // -------------------------
  // FETCH PLAYERS
  // -------------------------
  async function fetchPlayers() {
    if (!duelId) return;

    const { data } = await supabase
      .from("db_duel_players")
      .select("*")
      .eq("duel_id", duelId)
      .order("slot");

    setPlayers(data || []);
  }

  // -------------------------
  // JOIN LOGIC (AUTO SLOT)
  // -------------------------
  async function join() {
    if (!duelId) return;

    const { data } = await supabase
      .from("db_duel_players")
      .select("*")
      .eq("duel_id", duelId);

    const existingSlots = data?.map((p) => p.slot) || [];

    let slot: "A" | "B" | null = null;

    if (!existingSlots.includes("A")) slot = "A";
    else if (!existingSlots.includes("B")) slot = "B";

    if (!slot) {
      console.log("Both slots taken");
      return;
    }

    const { error } = await supabase
      .from("db_duel_players")
      .insert({
        duel_id: duelId,
        player_token: crypto.randomUUID(),
        slot,
      });

    if (error) {
      console.error("Join error:", error.message);
      return;
    }

    await fetchPlayers();
  }

  // -------------------------
  // START ROUND
  // -------------------------
  async function startRound() {
    if (!duelId) return;

    await supabase.rpc("db_start_round", {
      p_duel_id: duelId,
      p_question_id: "Q1",
      p_duration: 10,
    });

    await fetchRound();
  }

  // -------------------------
  // FETCH ROUND
  // -------------------------
  async function fetchRound() {
    if (!duelId) return;

    const { data } = await supabase
      .from("db_duel_rounds")
      .select("*")
      .eq("duel_id", duelId)
      .eq("status", "active")
      .limit(1);

    if (data && data.length > 0) {
      setRound(data[0]);
    } else {
      setRound(null);
    }
  }

  // -------------------------
  // SUBMIT GUESS
  // -------------------------
  async function submitGuess(slot: "A" | "B") {
    if (!round || loading) return;

    setLoading(true);

    await supabase.from("db_duel_submissions").insert({
      round_id: round.id,
      slot,
      guess: Number(guess),
    });

    setGuess("");

    await waitForResolve();
    await fetchPlayers();
    await fetchRound();

    setLoading(false);
  }

  async function waitForResolve() {
    if (!round) return;

    let done = false;

    while (!done) {
      const { data } = await supabase
        .from("db_duel_rounds")
        .select("status")
        .eq("id", round.id)
        .single();

      if (data?.status === "resolved") {
        done = true;
      } else {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  useEffect(() => {
    if (duelId) {
      fetchPlayers();
      fetchRound();
    }
  }, [duelId]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Duel V2 Multiplayer</h1>

      {!duelId && (
        <button onClick={createDuel}>
          Create Duel
        </button>
      )}

      {duelId && (
        <>
          <p>Duel ID: {duelId}</p>

          <button onClick={join}>
            Join Duel
          </button>

          <button onClick={startRound}>
            Start Round
          </button>

          {round && (
            <>
              <h2>Active Round</h2>

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
