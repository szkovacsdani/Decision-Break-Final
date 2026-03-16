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
  const [rounds, setRounds] = useState<any[]>([]);

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

      if (gameOver) {
        const { data: roundsData } = await supabase
          .from("duel_rounds")
          .select("round_index,winner_slot")
          .eq("duel_id", duelId)
          .order("round_index", { ascending: true });

        setRounds(roundsData || []);
      }

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

      if (!question || question.question_id !== roundData.question_id) {
        const { data: questionData } = await supabase
          .from("duel_questions")
          .select("question, correct_answer")
          .eq("id", roundData?.question_id)
          .single();

        if (questionData) {
          setQuestion({
            question: questionData.question,
            answer: questionData.correct_answer,
            question_id: roundData.question_id,
          });
        }
      }

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
          /* score update */

          const { data: playersData } = await supabase
            .from("duel_players")
            .select("*")
            .eq("duel_id", duelId);

          setPlayers(playersData || []);

          resolvingRef.current = false;
        }
      }

      if (roundData.resolved && handledRound !== roundData.round_index) {
        setHandledRound(roundData.round_index);

        const { data: submissions } = await supabase
          .from("duel_submissions")
          .select("slot, guess, response_time")
          .eq("duel_id", duelId)
          .eq("q_index", roundData.round_index);

        const subA = submissions?.find((s: any) => s.slot === "A");
        const subB = submissions?.find((s: any) => s.slot === "B");

        setRound({
          ...roundData,
          guessA: subA?.guess ?? "-",
          guessB: subB?.guess ?? "-",
          timeA: subA?.response_time ?? "-",
          timeB: subB?.response_time ?? "-",
        });

        setIsShowingResult(true);

        if (roundData.round_index === 3) {
          setTimeout(() => setGameOver(true), 5000);
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

  /* ---------- LOBBY ---------- */

  if (!duelId) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2>Duel</h2>

          <p style={{ opacity: 0.8, marginBottom: 20 }}>
            Two players compete across 3 rounds. Each round you must guess the
            answer to a real-world question. The closest answer wins the round.
            If guesses are equally close, the faster player wins.
          </p>

          <button
            onClick={createRoom}
            style={{
              width: "100%",
              padding: 14,
              background: "#b30000",
              border: "none",
              borderRadius: 8,
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
              marginBottom: 15,
            }}
          >
            Create Room
          </button>

          <input
            placeholder="Enter Room Code"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value)}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 8,
              border: "none",
              marginBottom: 10,
              color: "black",
            }}
          />

          <button
            onClick={joinRoom}
            style={{
              width: "100%",
              padding: 14,
              background: "#444",
              border: "none",
              borderRadius: 8,
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  /* ---------- GAME OVER ---------- */

  if (gameOver) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2>Game Over</h2>

          <p>Player A: {playerA?.round_points ?? 0}</p>
          <p>Player B: {playerB?.round_points ?? 0}</p>

          <div
            style={{
              marginTop: 25,
              padding: 15,
              background: "#1a1a1a",
              borderRadius: 10,
            }}
          >
            {room?.duel_result}
          </div>
          <div style={{ marginTop: 25 }}>
            <h3>Round Results</h3>

            {rounds.map((r) => (
              <div
                key={r.round_index}
                style={{
                  padding: "8px 12px",
                  marginBottom: 6,
                  borderRadius: 6,
                  background:
                    r.winner_slot === "A"
                      ? "#0f3d1f"
                      : r.winner_slot === "B"
                      ? "#3d0f0f"
                      : "#333",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Round {r.round_index}</span>

                <span>
                  {r.winner_slot === "A" && "Player A wins"}
                  {r.winner_slot === "B" && "Player B wins"}
                  {r.winner_slot === "DRAW" && "Draw"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- WAITING ROOM ---------- */

  if (room?.status === "waiting") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h3>You are Player {slot}</h3>
          <h2>Room Code: {room?.code}</h2>
          <p>Waiting for opponent...</p>
        </div>
      </div>
    );
  }

  /* ---------- GAME START ---------- */

  if (!round || !question?.question) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2>Game starting...</h2>
        </div>
      </div>
    );
  }
  /* ---------- GAME ---------- */

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2>Round {round?.round_index ?? "-"}</h2>

        <p>{question?.question ?? "-"}</p>

        <p>Time left: {timeLeft}</p>

        <div style={{ height: 10 }} />

        <div style={{ marginTop: 20 }}>
          <h3>Score</h3>
          <p>Player A: {playerA?.round_points ?? 0}</p>
          <p>Player B: {playerB?.round_points ?? 0}</p>
        </div>

        {round?.resolved && (
          <div style={{ marginTop: 30, lineHeight: 1.6 }}>
            <h3>Round Result</h3>

            <p>Correct answer: {question?.answer ?? "-"}</p>

            <p>Player A guess: {round?.guessA ?? "-"}</p>
            <p>Player B guess: {round?.guessB ?? "-"}</p>

            <p>Player A time: {round?.timeA ?? "-"} s</p>
            <p>Player B time: {round?.timeB ?? "-"} s</p>
          </div>
        )}

        {!submitted && !isShowingResult && (
          <div style={{ marginTop: 20 }}>
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Enter your guess"
              style={{
                width: "100%",
                padding: 12,
                marginBottom: 10,
                borderRadius: 6,
                border: "none",
                color: "black",
                background: "white",
              }}
            />

            <button
              onClick={submitGuess}
              style={{
                width: "100%",
                padding: 12,
                background: "#b30000",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Submit
            </button>
          </div>
        )}

        {submitted && !isShowingResult && (
          <p style={{ marginTop: 20 }}>
            Answer submitted. Waiting for opponent...
          </p>
        )}
      </div>
    </div>
  );
}
