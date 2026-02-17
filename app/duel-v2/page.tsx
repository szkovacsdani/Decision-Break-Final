"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DuelV2() {
  const searchParams = useSearchParams();
  const duelId = searchParams.get("duel");

  const [players, setPlayers] = useState<any[]>([]);
  const [round, setRound] = useState<any>(null);
  const [guess, setGuess] = useState("");
  const [loading, setLoading] = useState(false);

  // ---------------- FETCH PLAYERS
  async function fetchPlayers() {
    if (!duelId) return;

    const { data } = await supabase
      .from("db_duel_players")
      .select("*")
      .eq("duel_id", duelId)
      .order("slot");

    setPlayers(data || []);
  }

  // ---------------- FETCH ACTIVE ROUND
  async function fetchActiveRound() {
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

  // ---------------- JOIN
  async function join() {
    if (!duelId) return;

    const { data } = await supabase
      .from("db_duel_players")
      .select("*")
      .eq("duel_id", duelId);

    const slots = data?.map((p) => p.slot) || [];

    let slot: "A" | "B" | null = null;

    if (!slots.includes("A")) slot = "A";
    else if (!slots.includes("B")) slot = "B";

    if (!slot) return;

    await supabase.from("db_duel_players").insert({
      duel_id: duelId,
      player_token: crypto.randomUUID(),
      slot,
    });

    await fetchPlayers();
  }

  // ---------------- START ROUND
  async function startRound() {
    if (!duelId) return;

    await supabase.rpc("db_start_round", {
      p_duel_id: duelId,
      p_question_id: "Q1",
      p_duration: 10,
    });

    await fetchActiveRound();
  }

  // ---------------- SUBMIT
  async function submitGuess(slot: "A" | "B") {
    if (!duelId || loading) return;

    setLoading(true);

    // mindig friss round lekérés submit előtt
    const { data } = await supabase
      .from("db_duel_rounds")
      .select("*")
      .eq("duel_id", duelId)
      .eq("status", "active")
      .limit(1);

    if (!data || data.length === 0) {
      setLoading(false);
      return;
    }

    const activeRound = data[0];

    await supabase.from("db_duel_submissions").insert({
      round_id: activeRound.id,
      slot,
      guess: Number(guess),
    });

    setGuess("");

    // kis delay resolve után
    setTimeout(async () => {
      await fetchPlayers();
      await fetchActiveRound();
      setLoading(false);
    }, 800);
  }

  useEffect(() => {
    if (duelId) {
      fetchPlayers();
      fetchActiveRound();
    }
  }, [duelId]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Duel Multiplayer Stable</h1>

      {!duelId && <p>No duel ID in URL</p>}

      {duelId && (
        <>
          <p>Duel ID: {duelId}</p>

          <button onClick={join}>Join Duel</button>
          <button onClick={startRound}>Start Round</button>

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
