"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
};

type Round = {
  round_index: number;
  resolved: boolean;
  started_at: string;
  duration_sec: number;
  question_id: string;
};

type Question = {
  question_text: string;
};

export default function DuelPage() {
  const searchParams = useSearchParams();
  const duelId = searchParams.get("id");
  const slot = searchParams.get("slot");

  const [room, setRoom] = useState<Room | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [guess, setGuess] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Reset submission when new round starts
  useEffect(() => {
    setSubmitted(false);
    setGuess("");
  }, [room?.current_q]);

  useEffect(() => {
    if (!duelId) return;

    const interval = setInterval(async () => {
      const { data: roomData } = await supabase
        .from("duel_rooms")
        .select("id,status,current_q")
        .eq("id", duelId)
        .single();

      if (!roomData) return;
      setRoom(roomData);

      const { data: roundData } = await supabase
        .from("duel_rounds")
        .select("*")
        .eq("duel_id", duelId)
        .eq("round_index", roomData.current_q)
        .maybeSingle();

      if (roundData) {
        setRound(roundData);

        const { data: questionData } = await supabase
          .from("duel_questions")
          .select("question_text")
          .eq("id", roundData.question_id)
          .single();

        setQuestion(questionData || null);

        if (!roundData.resolved) {
          const start = new Date(roundData.started_at).getTime();
          const diff =
            roundData.duration_sec -
            Math.floor((Date.now() - start) / 1000);

          setTimeLeft(diff > 0 ? diff : 0);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [duelId]);

  const handleSubmit = async () => {
    if (!duelId || !room || !guess || !slot) return;

    await supabase.from("duel_submissions").insert({
      duel_id: duelId,
      q_index: room.current_q,
      slot: slot,
      guess: Number(guess),
    });

    setSubmitted(true);
  };

  if (!duelId || !slot)
    return <div style={{ padding: 20 }}>Missing duel data.</div>;

  if (!room) return <div style={{ padding: 20 }}>Loading...</div>;

  const danger = timeLeft <= 3 && !round?.resolved;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f12",
        color: "white",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontSize: 42 }}>
        Duel Round {room.current_q}
      </h1>

      {question && (
        <div
          style={{
            fontSize: 22,
            maxWidth: 600,
            textAlign: "center",
            marginBottom: 40,
          }}
        >
          {question.question_text}
        </div>
      )}

      {!round?.resolved && (
        <>
          <div
            style={{
              fontSize: 64,
              marginBottom: 30,
              color: danger ? "#ff2e2e" : "white",
              transition: "all 0.3s ease",
            }}
          >
            {timeLeft}
          </div>

          {!submitted ? (
            <>
              <input
                type="number"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                style={{
                  padding: 15,
                  fontSize: 20,
                  width: 200,
                  textAlign: "center",
                  background: "#1a1a1f",
                  color: "white",
                  border: "1px solid #333",
                  borderRadius: 8,
                  marginBottom: 20,
                }}
              />
              <button
                onClick={handleSubmit}
                style={{
                  padding: "12px 30px",
                  fontSize: 16,
                  background: "#d62828",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Submit
              </button>
            </>
          ) : (
            <div style={{ opacity: 0.6 }}>
              Waiting for opponent...
            </div>
          )}
        </>
      )}

      {round?.resolved && (
        <div style={{ fontSize: 24, marginTop: 40 }}>
          Round resolved
        </div>
      )}

      {room.status === "finished" && (
        <div style={{ fontSize: 28, marginTop: 40 }}>
          Game Finished
        </div>
      )}
    </div>
  );
}
