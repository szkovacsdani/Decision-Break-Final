"use client";

import { useEffect, useState, useRef } from "react";
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
  const [isShowingResult, setIsShowingResult] = useState(false);
  const [handledRound, setHandledRound] = useState<number | null>(null);

  const resolvingRef = useRef(false);

  useEffect(() => {
    setSubmitted(false);
    setGuess("");
  }, [room?.current_q]);

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

      if (roomData.status !== "playing") return;

      const { data: roundData } = await supabase
        .from("duel_rounds")
        .select("*")
        .eq("duel_id", duelId)
        .eq("round_index", roomData.current_q)
        .maybeSingle();

      if (!roundData) return;

      if (!isShowingResult) {
        setRound(roundData);
      }

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

      // RESOLVE ROUND
      if (!roundData.resolved && !resolvingRef.current) {

        const { count } = await supabase
          .from("duel_submissions")
          .select("*", { count: "exact", head: true })
          .eq("duel_id", duelId)
          .eq("q_index", roundData.round_index);

        if (count === 2 || timeExpired) {
          resolvingRef.current = true;

          await supabase.rpc("resolve_round", {
            p_duel_id: duelId,
            p_round_index: roundData.round_index,
          });

          resolvingRef.current = false;
        }
      }

      // SHOW RESULT ONLY ONCE PER ROUND
      if (roundData.resolved && handledRound !== roundData.round_index) {

        setHandledRound(roundData.round_index);

        const { data: submissions } = await supabase
          .from("duel_submissions")
          .select("slot, guess")
          .eq("duel_id", duelId)
          .eq("q_index", roundData.round_index);

        const guessA =
          submissions?.find((s) => s.slot === "A")?.guess ?? "-";
        const guessB =
          submissions?.find((s) => s.slot === "B")?.guess ?? "-";

        setRound({
          ...roundData,
          guessA,
          guessB,
        });

        setIsShowingResult(true);

        setTimeout(async () => {

          setIsShowingResult(false);
        
          await supabase.rpc("advance_round", {
            p_duel_id: duelId,
          });
        
        }, 5000);
        
      }

    }, 1000);

    return () => clearInterval(interval);

  }, [duelId, isShowingResult, handledRound]);

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

    await supabase.from("duel_submissions").insert({
      duel_id: duelId,
      q_index: round.round_index,
      slot,
      guess: Number(guess),
      response_time: responseTime,
    });

    setSubmitted(true);
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
          <h1>Duel</h1>
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

    const danger = timeLeft <= 3 && !isShowingResult;
    const blink = timeLeft <= 3 && timeLeft % 2 === 0;

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h3>You are Player {slot}</h3>
          <h2>Round {room.current_q}</h2>

          <p>Player A: {playerA?.position || 0}</p>
          <p>Player B: {playerB?.position || 0}</p>

          {question && <p>{question.question}</p>}

          {!isShowingResult && !round?.resolved && (
            <>
              <h1
                style={{
                  fontSize: 60,
                  color: danger ? "#ff1a1a" : "white",
                  opacity: blink ? 0.4 : 1,
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

          {isShowingResult && (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <h3>Round Result</h3>
              <p>Correct answer: {round?.correct_answer}</p>
              <p>Player A guessed: {round?.guessA}</p>
              <p>Player B guessed: {round?.guessB}</p>
              <p>Player A diff: {round?.diff_a}</p>
              <p>Player B diff: {round?.diff_b}</p>
              <h2>
                {round?.winner_slot === "DRAW"
                  ? "Draw"
                  : `Winner: Player ${round?.winner_slot}`}
              </h2>
              <p>Next round in 5 seconds...</p>
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

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2>Game Finished</h2>
          <p>Player A: {aScore}</p>
          <p>Player B: {bScore}</p>
          <h2>
            {winner === "DRAW"
              ? "Draw"
              : `Winner: Player ${winner}`}
          </h2>
          {winner !== "DRAW" && (
            <p>Winner: Move +1 space forward.</p>
          )}
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

  return null;
}
