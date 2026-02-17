"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

function getOrCreatePlayerToken() {
  if (typeof window === "undefined") return null;
  let token = localStorage.getItem("player_token");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("player_token", token);
  }
  return token;
}

export default function DuelPage() {
  const playerToken = useMemo(() => getOrCreatePlayerToken(), []);

  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [duel, setDuel] = useState<any>(null);
  const [round, setRound] = useState<any>(null);
  const [guess, setGuess] = useState("");
  const [loading, setLoading] = useState(false);

  // -----------------------------------
  // CREATE ROOM
  // -----------------------------------

  async function createRoom() {
    setLoading(true);
    const { data, error } = await supabase.rpc("create_duel", {
      p_player: playerToken,
    });
    if (!error) {
      setRoomCode(data[0].room_code);
      await fetchDuel(data[0].room_code);
    }
    setLoading(false);
  }

  // -----------------------------------
  // JOIN ROOM
  // -----------------------------------

  async function joinRoom() {
    if (!inputCode) return;
    setLoading(true);

    await supabase.rpc("join_duel", {
      p_room_code: inputCode,
      p_player: playerToken,
    });

    setRoomCode(inputCode);
    await fetchDuel(inputCode);

    setLoading(false);
  }

  // -----------------------------------
  // FETCH DUEL
  // -----------------------------------

  async function fetchDuel(code: string) {
    const { data } = await supabase
      .from("db_duels")
      .select("*")
      .eq("room_code", code)
      .single();

    if (data) {
      setDuel(data);

      if (data.status === "playing") {
        fetchRound(data.id, data.current_round);
      }
    }
  }

  // -----------------------------------
  // FETCH ROUND
  // -----------------------------------

  async function fetchRound(duelId: string, roundNumber: number) {
    const { data } = await supabase
      .from("db_duel_rounds")
      .select("*, db_questions(*)")
      .eq("duel_id", duelId)
      .eq("round_number", roundNumber)
      .single();

    if (data) setRound(data);
  }

  // -----------------------------------
  // START DUEL
  // -----------------------------------

  async function startDuel() {
    if (!duel) return;
    await supabase.rpc("start_duel", {
      p_duel_id: duel.id,
    });
    await fetchDuel(roomCode);
  }

  // -----------------------------------
  // SUBMIT
  // -----------------------------------

  async function submitGuess() {
    if (!duel || !guess) return;

    await supabase.rpc("submit_guess", {
      p_duel_id: duel.id,
      p_player: playerToken,
      p_guess: Number(guess),
    });

    setGuess("");
  }

  // -----------------------------------
  // POLLING
  // -----------------------------------

  useEffect(() => {
    if (!roomCode) return;

    const interval = setInterval(() => {
      fetchDuel(roomCode);
    }, 2000);

    return () => clearInterval(interval);
  }, [roomCode]);

  // -----------------------------------
  // TIMER (UI ONLY)
  // -----------------------------------

  const timeLeft =
    round &&
    10 -
      Math.floor(
        (Date.now() - new Date(round.started_at).getTime()) / 1000
      );

  const isCreator = duel?.created_by === playerToken;

  const canStart =
    duel?.status === "waiting" &&
    duel?.player_a &&
    duel?.player_b &&
    isCreator;

  const duelFinished = duel?.status === "finished";

  // -----------------------------------
  // UI
  // -----------------------------------

  return (
    <div style={{ padding: 40 }}>
      <h1>Decision Break Duel</h1>

      {!duel && (
        <>
          <button onClick={createRoom} disabled={loading}>
            Create Room
          </button>

          <div style={{ marginTop: 20 }}>
            <input
              placeholder="Enter Room Code"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            />
            <button onClick={joinRoom}>Join</button>
          </div>
        </>
      )}

      {duel && (
        <>
          <h2>Room: {roomCode}</h2>
          <p>Status: {duel.status}</p>
          <p>
            Score A: {duel.score_a} | Score B: {duel.score_b}
          </p>

          {canStart && (
            <button onClick={startDuel}>Start Duel</button>
          )}

          {round && duel.status === "playing" && (
            <>
              <h3>Round {duel.current_round}</h3>
              <p>{round.db_questions.question_text}</p>

              {round.resolved_at ? (
                <>
                  <p>
                    Winner:{" "}
                    {round.winner_slot
                      ? round.winner_slot
                      : "DRAW"}
                  </p>
                  <p>
                    Correct: {round.db_questions.correct_value}
                  </p>
                </>
              ) : (
                <>
                  <p>Time Left: {timeLeft > 0 ? timeLeft : 0}</p>

                  {timeLeft > 0 && (
                    <>
                      <input
                        type="number"
                        value={guess}
                        onChange={(e) =>
                          setGuess(e.target.value)
                        }
                      />
                      <button onClick={submitGuess}>
                        Submit
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {duelFinished && (
            <>
              <h2>DUEL FINISHED</h2>
              {duel.score_a > duel.score_b && <p>A Wins</p>}
              {duel.score_b > duel.score_a && <p>B Wins</p>}
              {duel.score_a === duel.score_b && <p>DRAW</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
