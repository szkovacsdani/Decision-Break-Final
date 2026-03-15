"use client";

export const dynamic = "force-dynamic";

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
  const [gameOver, setGameOver] = useState(false);

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
        .order("round_index", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!roundData) return;

      if (!isShowingResult) {
        setRound(roundData);
      }

      const { data: questionData } = await supabase
        .from("duel_questions")
        .select("question, answer")
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

        const submissions = count ?? 0;

        if (submissions >= 2 || timeExpired) {
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

        if (roundData.round_index === 3) {
          setGameOver(true);
          return;
        }

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

  if (gameOver) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2>Game Over</h2>
          <p>Player A score: {playerA?.position ?? 0}</p>
          <p>Player B score: {playerB?.position ?? 0}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2>Round {round.round_index}</h2>

        <p>{question.question}</p>

        <p>Time left: {timeLeft}</p>

        <p>Score</p>
        <p>Player A: {playerA?.position ?? 0}</p>
        <p>Player B: {playerB?.position ?? 0}</p>

        {isShowingResult && (
          <div>
            <h3>Round Result</h3>
            <p>Correct answer: {question.answer}</p>
            <p>Player A guess: {round.guessA}</p>
            <p>Player B guess: {round.guessB}</p>
          </div>
        )}

        {!submitted && !isShowingResult && (
          <>
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Enter your guess"
            />

            <button onClick={submitGuess}>Submit</button>
          </>
        )}

        {submitted && !isShowingResult && (
          <p>Answer submitted. Waiting for opponent...</p>
        )}
      </div>
    </div>
  );
}
