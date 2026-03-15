"use client";

import { useEffect, useState, useRef } from "react";
import { getSupabase } from "@/lib/supabase";

export default function Page() {
  const supabaseRef = useRef(getSupabase());
  const supabase = supabaseRef.current;

  function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  const [duelId, setDuelId] = useState<string | null>(null);
  const [slot, setSlot] = useState<"A" | "B" | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");

  const [room, setRoom] = useState<any | null>(null);
  const [round, setRound] = useState<any | null>(null);
  const [question, setQuestion] = useState<any | null>(null);
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
        .order("round_index", { ascending: true })
        .limit(1)
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

      const timeExpired = Date.now() - start >= roundData.duration_sec * 1000;

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

      if (roundData.resolved && handledRound !== roundData.round_index) {
        setHandledRound(roundData.round_index);

        const { data: submissions } = await supabase
          .from("duel_submissions")
          .select("slot, guess")
          .eq("duel_id", duelId)
          .eq("q_index", roundData.round_index);

        const guessA =
          submissions?.find((s: any) => s.slot === "A")?.guess ?? "-";

        const guessB =
          submissions?.find((s: any) => s.slot === "B")?.guess ?? "-";

        setRound({
          ...roundData,
          guessA,
          guessB,
        });

        setIsShowingResult(true);

        setTimeout(async () => {
          await supabase.rpc("advance_round", {
            p_duel_id: duelId,
          });

          setIsShowingResult(false);
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

          <div style={{ marginBottom: 20, lineHeight: 1.6 }}>
            <strong>Duel Rules</strong>
            <br />
            2 players compete in 3 rounds.
            <br />
            Each round lasts 10 seconds.
            <br />
            Closest answer wins the round.
          </div>

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

  if (!room) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2>Loading room...</h2>
        </div>
      </div>
    );
  }

  if (room.status === "waiting") {
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

  if (!round || !question) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2>Game starting...</h2>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2>Round {round.round_index}</h2>

        <p style={{ marginBottom: 20 }}>{question.question}</p>

        <p>Time left: {timeLeft}</p>

        {!submitted && (
          <>
            <input
              style={inputStyle}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Enter your guess"
            />

            <button style={buttonStyle} onClick={submitGuess}>
              Submit
            </button>
          </>
        )}

        {submitted && <p>Answer submitted. Waiting for opponent...</p>}
      </div>
    </div>
  );
}
