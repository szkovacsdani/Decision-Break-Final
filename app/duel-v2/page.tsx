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
  const [showResultUntil, setShowResultUntil] = useState<number | null>(null);

  // Reset on new round
  useEffect(() => {
    setSubmitted(false);
    setGuess("");
    setShowResultUntil(null);
  }, [room?.current_q]);

  // Main polling
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

      if (playersData?.length === 2 && roomData.status === "waiting") {
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
        const elapsed = Math.floor((Date.now() - start) / 1000);
        const remaining = roundData.duration_sec - elapsed;

        setTimeLeft(remaining > 0 ? remaining : 0);

        const timeExpired =
          Date.now() - start >= roundData.duration_sec * 1000;

        if (!roundData.resolved) {
          const { count } = await supabase
            .from("duel_submissions")
            .select("*", { count: "exact", head: true })
            .eq("duel_id", duelId)
            .eq("q_index", roundData.round_index);

          if (count === 2 || timeExpired) {
            await supabase.rpc("resolve_round", {
              p_duel_id: duelId,
              p_round_index: roundData.round_index,
            });
          }
        }

        if (roundData.resolved && !showResultUntil) {
          setShowResultUntil(Date.now() + 4000);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
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

  const containerStyle = {
    minHeight: "100vh",
    background: "radial-gradient(circle at center, #1a0000 0%, #000000 70%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
  };

  const cardStyle = {
    background: "#0d0d0d",
    padding: "40px",
    borderRadius: "20px",
    width: "100%",
    maxWidth: "600px",
    boxShadow: "0 0 60px rgba(255,0,0,0.3)",
    border: "1px solid rgba(255,0,0,0.2)",
  };

  const buttonStyle = {
    width: "100%",
    padding: 12,
    background: "#b30000",
    color: "white",
    fontWeight: "bold",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
  };

  const inputStyle = {
    width: "100%",
    padding: 12,
    marginBottom: 10,
    background: "#ffffff",
    color: "#000000",
    fontSize: 18,
    borderRadius: 8,
    border: "none",
  };

  if (!duelId) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={{ textAlign: "center" }}>Duel</h1>
          <button style={buttonStyle} onClick={createRoom}>
            Create Room
          </button>

          <input
            placeholder="Enter Room Code"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value)}
            style={{ ...inputStyle, marginTop: 20 }}
          />

          <button style={buttonStyle} onClick={joinRoom}>
            Join
          </button>
        </div>
      </div>
    );
  }

  if (room?.status === "waiting") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h3>You are Player {slot}</h3>
          <h2>Room Code: {room.code}</h2>
          <p>Waiting for opponent...</p>
        </div>
      </div>
    );
  }

  if (room?.status === "playing") {
    const isPaused =
      round?.resolved &&
      showResultUntil &&
      Date.now() < showResultUntil;

    const danger = timeLeft <= 3 && !round?.resolved;
    const blink = timeLeft <= 3 && timeLeft % 2 === 0;

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h3>You are Player {slot}</h3>
          <h2>Round {room.current_q}</h2>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ color: "#ff1a1a" }}>Score</h3>
            <p>Player A: {playerA?.position || 0}</p>
            <p>Player B: {playerB?.position || 0}</p>
          </div>

          {question && (
            <p style={{ fontSize: 18, marginBottom: 20 }}>
              {question.question}
            </p>
          )}

          {!round?.resolved && !isPaused && (
            <>
              <h1
                style={{
                  fontSize: 60,
                  textAlign: "center",
                  color: danger ? "#ff1a1a" : "white",
                  textShadow: danger ? "0 0 20px red" : "none",
                  opacity: blink ? 0.4 : 1,
                  transition: "opacity 0.2s",
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
                    style={inputStyle}
                  />
                  <button style={buttonStyle} onClick={submitGuess}>
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
              <h2>
                {round.winner_slot === "DRAW"
                  ? "Draw"
                  : `Winner: Player ${round.winner_slot}`}
              </h2>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (room?.status === "finished") {
    const aScore = playerA?.position || 0;
    const bScore = playerB?.position || 0;
  
    let winner: "A" | "B" | "DRAW" = "DRAW";
    if (aScore > bScore) winner = "A";
    if (bScore > aScore) winner = "B";
  
    let rewardText = "";
    let penaltyText = "";
  
    if (winner === "DRAW") {
      rewardText = "No movement.";
    } else {
      rewardText = "Winner: Move +2 spaces forward.";
      penaltyText = "Loser: Move -1 space backward.";
    }
  
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h3>You are Player {slot}</h3>
          <h2 style={{ marginBottom: 20 }}>Game Finished</h2>
  
          <p>Player A: {aScore}</p>
          <p>Player B: {bScore}</p>
  
          <h2 style={{ marginTop: 20 }}>
            {winner === "DRAW"
              ? "Draw"
              : `Winner: Player ${winner}`}
          </h2>
  
          <div
            style={{
              marginTop: 30,
              padding: 20,
              background: "rgba(255,0,0,0.1)",
              border: "1px solid rgba(255,0,0,0.3)",
              borderRadius: 12,
              textAlign: "center",
            }}
          >
            <h3 style={{ color: "#ff1a1a" }}>Board Action</h3>
            <p style={{ fontSize: 18 }}>{rewardText}</p>
            {penaltyText && (
              <p style={{ fontSize: 18 }}>{penaltyText}</p>
            )}
          </div>
  
          <button
            style={buttonStyle}
            onClick={() => (window.location.href = "/")}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }
  
