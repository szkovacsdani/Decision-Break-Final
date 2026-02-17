"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DuelV2() {
  const [duelId, setDuelId] = useState("");
  const [round, setRound] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [guess, setGuess] = useState("");
  const [loading, setLoading] = useState(false);

  async function createDuel() {
    const { data, error } = await supabase
      .from("db_duels")
      .insert({ status: "waiting" })
      .select()
      .single();

    if (error) {
      console.error("Create duel error:", error);
      return;
    }

    setDuelId(data.id);
  }

  async function joinAs(slot: "A" | "B") {
    if (!duelId) return;

    const { error } = await supabase.from("db_duel_players").insert({
      duel_id: duelId,
      player_token: crypto.randomUUID(),
      slot,
    });

    if (error) {
      console.error("Join error:", error);
      return;
    }

    await fetchPlayers();
  }

  async function fetchPlayers() {
    if (!duelId) return;

    const { data, error } = await supabase
      .from("db_duel_players")
      .select("*")
      .eq("duel_id", duelId);

    if (error) {
      console.error("Fetch players error:", error);
      return;
    }

    setPlayers(data || []);
  }

  async function startRound() {
    if (!duelId) return;

    const { error } = await supabase.rpc("db_start_round", {
      p_duel_id: duelId,
      p_question_id: "Q1",
    });

    if (error) {
      console.error("Start round error:", error);
      return;
    }

    await fetchRound();
    await fetchPlayers();
  }

  async function fetchRound() {
    if (!duelId) return;

    const { data, error } = await supabase
      .from("db_duel_rounds")
      .select("*")
      .eq("duel_id", duelId)
      .eq("status", "active")
      .limit(1);

    if (error) {
      console.error("Fetch round error:", error);
      setRound(null);
      return;
    }

    if (data && data.length > 0) {
      setRound(data[0]);
    } else {
      setRound(null);
    }
  }

  async function submitGuess(slot: "A" | "B") {
    if (!round || loading) return;

    setLoading(true);

    const { error } = await supabase.from("db_duel_submissions").insert({
      round_id: round.id,
      slot,
      guess: Number(guess),
    });

    if (error) {
      console.error("Submit error:", error);
      setLoading(false);
      return;
    }

    setGuess("");

    // Allow backend resolve to finish
    setTimeout(async () => {
      await fetchPlayers();
      await fetchRound();
      setLoading(false);
    }, 300);
  }

  useEffect(() => {
    if (duelId) {
      fetchPlayers();
      fetchRound();
    }
  }, [duelId]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Duel V2</h1>

      {!duelId && (
        <button onClick={createDuel}>
          Create Duel
        </button>
      )}

      {duelId && (
        <>
          <p>Duel ID: {duelId}</p>

          <button onClick={() => joinAs("A")}>
            Join as A
          </button>

          <button onClick={() => joinAs("B")}>
            Join as B
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

              <button
                disabled={loading}
                onClick={() => submitGuess("A")}
              >
                Submit as A
              </button>

              <button
                disabled={loading}
                onClick={() => submitGuess("B")}
              >
                Submit as B
              </button>
            </>
          )}

          <h3>Scores</h3>

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
