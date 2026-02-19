"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 })
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join("");
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

  const [lockedRoundIndex, setLockedRoundIndex] = useState<number | null>(null);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // RESET INPUT ON NEW ROUND
  useEffect(() => {
    setSubmitted(false);
    setGuess("");
  }, [room?.current_q]);

  // MAIN POLLING (ONLY duelId dependency!)
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

      // AUTO START
      if (playersData?.length === 2 && roomData.status === "waiting") {
        await supabase.rpc("start_duel", {
          p_duel_id: duelId,
        });
      }      

      if (roomData.status === "playing") {
        const roundIndex =
          lockedRoundIndex !== null
            ? lockedRoundIndex
            : roomData.current_q;

        const { data: roundData } = await supabase
          .from("duel_rounds")
          .select("*")
          .eq("duel_id", duelId)
          .eq("round_index", roundIndex)
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
        const elapsed = Math.floor((Date.now() - start) / 1000);
        const remaining = roundData.duration_sec - elapsed;

        setTimeLeft(remaining > 0 ? remaining : 0);

        const expired =
          Date.now() - start >= roundData.duration_sec * 1000;

        if (!roundData.resolved) {
          const { count } = await supabase
            .from("duel_submissions")
            .select("*", { count: "exact", head: true })
            .eq("duel_id", duelId)
            .eq("q_index", roundData.round_index);

          if (count === 2 || expired) {
            await supabase.rpc("resolve_round", {
              p_duel_id: duelId,
              p_round_index: roundData.round_index,
            });
          }
        }

        // LOCK ROUND FOR 4 SECONDS AFTER RESOLVE
        if (roundData.resolved && lockedRoundIndex === null) {
          setLockedRoundIndex(roundData.round_index);

          pauseTimeoutRef.current = setTimeout(() => {
            setLockedRoundIndex(null);
          }, 4000);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    };
  }, [duelId]);

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
  }

  async function joinRoom() {
    const { data } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", roomCodeInput.toUpperCase())
      .single();

    if (!data) return alert("Room not found");

    await supabase.from("duel_players").insert({
      duel_id: data.id,
      slot: "B",
      position: 0,
    });

    setDuelId(data.id);
    setSlot("B");
  }

  async function submitGuess() {
    if (!duelId || !slot || !round) return;
    if (guess === "") return;

    const start = new Date(round.started_at).getTime();
    const responseTime = Math.floor((Date.now() - start) / 1000);

    const { error } = await supabase.from("duel_submissions").insert({
      duel_id: duelId,
      q_index: round.round_index,
      slot,
      guess: Number(guess),
      response_time: responseTime,
    });

    if (!error) setSubmitted(true);
  }

  const playerA = players.find((p) => p.slot === "A");
  const playerB = players.find((p) => p.slot === "B");

  const container = {
    minHeight: "100vh",
    background: "radial-gradient(circle at center, #1a0000 0%, #000 70%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
  };

  const card = {
    background: "#0d0d0d",
    padding: 40,
    borderRadius: 20,
    width: "100%",
    maxWidth: 600,
    boxShadow: "0 0 60px rgba(255,0,0,0.3)",
  };

  const button = {
    width: "100%",
    padding: 12,
    background: "#b30000",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer",
  };

  const input = {
    width: "100%",
    padding: 12,
    background: "#fff",
    color: "#000",
    fontSize: 18,
    borderRadius: 8,
    border: "none",
    marginBottom: 10,
  };

  if (!duelId) {
    return (
      <div style={container}>
        <div style={card}>
          <h1>Duel</h1>
          <button style={button} onClick={createRoom}>
            Create Room
          </button>
          <input
            placeholder="Room Code"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value)}
            style={{ ...input, marginTop: 20 }}
          />
          <button style={button} onClick={joinRoom}>
            Join
          </button>
        </div>
      </div>
    );
  }

  if (room?.status === "finished") {
    const a = playerA?.position || 0;
    const b = playerB?.position || 0;

    let action = "";
    let winner = "";

    if (a === b) {
      winner = "Draw";
      action = "Both of you move forward 1 space.";
    } else if (a > b) {
      winner = "Winner: Player A";
      action =
        a === 3 && b === 0
          ? "Player A +2 spaces. Player B -1 space."
          : "Player A +1 space. Player B stays.";
    } else {
      winner = "Winner: Player B";
      action =
        b === 3 && a === 0
          ? "Player B +2 spaces. Player A -1 space."
          : "Player B +1 space. Player A stays.";
    }

    return (
      <div style={container}>
        <div style={card}>
          <h3>You are Player {slot}</h3>
          <h2>Game Finished</h2>
          <p>Player A: {a}</p>
          <p>Player B: {b}</p>
          <h2>{winner}</h2>
          <p style={{ marginTop: 20 }}>{action}</p>
          <button style={button} onClick={() => (window.location.href = "/")}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div style={card}>
        <h3>You are Player {slot}</h3>
        <h2>Round {room?.current_q}</h2>

        <p>Player A: {playerA?.position || 0}</p>
        <p>Player B: {playerB?.position || 0}</p>

        {question && <p style={{ margin: "20px 0" }}>{question.question}</p>}

        {!round?.resolved && (
          <>
            <h1
              style={{
                fontSize: 60,
                textAlign: "center",
                color: timeLeft <= 3 ? "#ff1a1a" : "white",
                opacity: timeLeft <= 3 && timeLeft % 2 === 0 ? 0.4 : 1,
              }}
            >
              {timeLeft}
            </h1>

            {!submitted ? (
              <>
                <input
                  type="number"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  style={input}
                />
                <button style={button} onClick={submitGuess}>
                  Submit
                </button>
              </>
            ) : (
              <p>Waiting for opponent...</p>
            )}
          </>
        )}

        {round?.resolved && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <h3>Round Result</h3>
            <p>Correct answer: {round.correct_answer}</p>
            <p>Player A diff: {round.diff_a}</p>
            <p>Player B diff: {round.diff_b}</p>
          </div>
        )}
      </div>
    </div>
  );
}
