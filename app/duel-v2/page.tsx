"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Phase = "answering" | "evaluating" | "finished";

export default function DuelPage() {
  const [duel, setDuel] = useState<any>(null);
  const [round, setRound] = useState<any>(null);
  const [question, setQuestion] = useState<any>(null);

  const [phase, setPhase] = useState<Phase>("answering");

  const [timeLeft, setTimeLeft] = useState(10);
  const [evaluationTime, setEvaluationTime] = useState(5);

  const duelIdRef = useRef<string | null>(null);
  const resolvingRef = useRef(false);

  // ------------------------------------------
  // FETCH DUEL + ROUND
  // ------------------------------------------

  const fetchState = async () => {
    if (!duelIdRef.current) return;

    const { data: duelData } = await supabase
      .from("db_duels")
      .select("*")
      .eq("id", duelIdRef.current)
      .single();

    setDuel(duelData);

    const { data: roundData } = await supabase
      .from("db_duel_rounds")
      .select("*")
      .eq("duel_id", duelIdRef.current)
      .is("resolved_at", null)
      .order("round_number", { ascending: false })
      .limit(1)
      .single();

    setRound(roundData);

    if (roundData) {
      const { data: questionData } = await supabase
        .from("db_questions")
        .select("*")
        .eq("id", roundData.question_id)
        .single();

      setQuestion(questionData);
    }
  };

  // ------------------------------------------
  // START DUEL
  // ------------------------------------------

  const startDuel = async () => {
    if (!duelIdRef.current) return;

    await supabase.rpc("start_duel", {
      p_duel_id: duelIdRef.current,
    });

    await fetchState();
    setPhase("answering");
    setTimeLeft(10);
  };

  // ------------------------------------------
  // RESOLVE ROUND
  // ------------------------------------------

  const resolveRound = async () => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;

    await supabase.rpc("resolve_round", {
      p_duel_id: duelIdRef.current,
    });

    await fetchState();

    resolvingRef.current = false;
  };

  // ------------------------------------------
  // ANSWERING TIMER (10 MP)
  // ------------------------------------------

  useEffect(() => {
    if (phase !== "answering") return;

    if (timeLeft <= 0) {
      resolveRound();
      setPhase("evaluating");
      setEvaluationTime(5);
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, phase]);

  // ------------------------------------------
  // EVALUATION TIMER (5 MP)
  // ------------------------------------------

  useEffect(() => {
    if (phase !== "evaluating") return;

    if (evaluationTime <= 0) {
      if (duel?.status === "finished") {
        setPhase("finished");
      } else {
        setPhase("answering");
        setTimeLeft(10);
      }
      return;
    }

    const interval = setInterval(() => {
      setEvaluationTime((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [evaluationTime, phase, duel]);

  // ------------------------------------------
  // AUTO POLL (BACKEND SYNC)
  // ------------------------------------------

  useEffect(() => {
    const interval = setInterval(() => {
      fetchState();
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // ------------------------------------------
  // INITIAL LOAD
  // ------------------------------------------

  useEffect(() => {
    const stored = localStorage.getItem("duel_id");
    if (stored) {
      duelIdRef.current = stored;
      fetchState();
    }
  }, []);

  // ------------------------------------------
  // RENDER
  // ------------------------------------------

  if (!duel) return <div>Loading...</div>;

  return (
    <div style={{ padding: 40 }}>
      <h2>Decision Break Duel</h2>

      <p>Room: {duel.room_code}</p>
      <p>Status: {duel.status}</p>
      <p>
        Score A: {duel.score_a} | Score B: {duel.score_b}
      </p>

      {duel.status === "waiting" && (
        <button onClick={startDuel}>Start Duel</button>
      )}

      {phase === "answering" && round && question && (
        <>
          <h3>Round {round.round_number}</h3>
          <p>{question.question}</p>
          <h1 style={{ color: timeLeft <= 3 ? "red" : "black" }}>
            {timeLeft}
          </h1>
        </>
      )}

      {phase === "evaluating" && round && (
        <>
          <h3>Round Result</h3>
          <p>Correct Answer: {round.correct_value}</p>
          <h2>{evaluationTime}</h2>
        </>
      )}

      {phase === "finished" && (
        <>
          <h2>Duel Finished</h2>
          <p>Winner: {duel.winner_slot}</p>
        </>
      )}
    </div>
  );
}
