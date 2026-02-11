"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Question = {
  id: string;
  category?: string;
  question: string;
  answers: { A: string; B: string; C: string; D: string };
  correct: "A" | "B" | "C" | "D";
};

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scoreRound(mode: 1 | 3 | 5, correctCount: number) {
  if (mode === 1) {
    if (correctCount === 1) return { action: "Move forward 1 space." };
    return { action: "No effect." };
  }

  if (mode === 3) {
    if (correctCount === 0) return { action: "Move back 1 space." };
    if (correctCount === 1) return { action: "Move forward 1 space." };
    if (correctCount === 2) return { action: "Move forward 2 spaces." };
    return { action: "Move forward 3 spaces." };
  }

  // mode === 5
  if (correctCount === 0 || correctCount === 1) return { action: "Move back 1 space." };
  if (correctCount === 2) return { action: "Move forward 1 space." };
  if (correctCount === 3) return { action: "Choose one player: they move back 1 space." };
  if (correctCount === 4) return { action: "Move forward 3 spaces." };
  return { action: "All opponents move back 2 spaces." };
}

export default function QuizPage() {
  // Settings
  const [mode, setMode] = useState<1 | 3 | 5>(3);
  const timePerQ = 10;

  // Data
  const [questions, setQuestions] = useState<Question[]>([]);
  const [round, setRound] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);

  // UI
  const [status, setStatus] = useState<"idle" | "playing" | "result">("idle");
  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [answers, setAnswers] = useState<{ id: string; correct: boolean }[]>([]);
  const [timeLeft, setTimeLeft] = useState(timePerQ);
  const [flash, setFlash] = useState(false);

  // Immediate feedback after lock-in
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastWasCorrect, setLastWasCorrect] = useState<boolean | null>(null);

  // Audio (refs avoid re-creating objects)
  const tickRef = useRef<HTMLAudioElement | null>(null);
  const buzzerRef = useRef<HTMLAudioElement | null>(null);

  const current = useMemo(() => round[idx], [round, idx]);
  const correctCount = useMemo(() => answers.filter((a) => a.correct).length, [answers]);
  const result = useMemo(() => scoreRound(mode, correctCount), [mode, correctCount]);

  useEffect(() => {
    // Load questions
    fetch("/questions.json")
      .then((r) => r.json())
      .then((data) => setQuestions((data?.questions || []) as Question[]))
      .catch(() => setQuestions([]));
  }, []);

  useEffect(() => {
    // Init audio
    tickRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3");
    buzzerRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3");
  }, []);

  function playTick() {
    const a = tickRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  function playBuzzer() {
    const a = buzzerRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  function startRound() {
    const pool = shuffle(questions);
    const pick = pool.slice(0, mode);
    setRound(pick);
    setIdx(0);
    setAnswers([]);
    setSelected(null);
    setShowFeedback(false);
    setLastWasCorrect(null);
    setStatus("playing");
  }

  function goNextOrFinish(nextIdx: number, roundLen: number) {
    if (nextIdx >= roundLen) {
      setStatus("result");
      return;
    }
    setIdx(nextIdx);
  }

  function submitAnswer(choice: "A" | "B" | "C" | "D" | null, isTimeout: boolean) {
    if (!current) return;

    const isCorrect = !isTimeout && choice !== null && choice === current.correct;

    setAnswers((prev) => [...prev, { id: current.id, correct: isCorrect }]);

    setLastWasCorrect(isCorrect);
    setShowFeedback(true);

    // short feedback delay then move on
    setTimeout(() => {
      setShowFeedback(false);
      const nextIdx = idx + 1;
      goNextOrFinish(nextIdx, round.length);
    }, 450);
  }

  // Timer
  useEffect(() => {
    if (status !== "playing") return;
    if (!current) return;

    setTimeLeft(timePerQ);
    setSelected(null);

    const intervalId = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1;

        if (next <= 3 && next > 0) {
          playTick();
        }

        if (next <= 0) {
          clearInterval(intervalId);

          setFlash(true);
          playBuzzer();
          setTimeout(() => setFlash(false), 250);

          // timeout counts as wrong
          submitAnswer(null, true);
          return 0;
        }

        return next;
      });
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [status, current]); // keep it simple and stable for Turbopack

  // Background color logic
  const bg =
    flash ? "#ff0000" : timeLeft <= 3 && status === "playing" ? "#3a0000" : "#0B0B0D";

  // Feedback border
  const feedbackBorder =
    showFeedback && lastWasCorrect === true
      ? "2px solid #22c55e"
      : showFeedback && lastWasCorrect === false
      ? "2px solid #ef4444"
      : "1px solid rgba(255,255,255,0.10)";

  const feedbackLabel =
    showFeedback && lastWasCorrect === true
      ? "Correct"
      : showFeedback && lastWasCorrect === false
      ? "Wrong"
      : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        transition: "background 0.15s ease",
        color: "#fff",
        padding: 24
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <a href="/" style={{ color: "#fff", textDecoration: "none", opacity: 0.85 }}>
            ← Home
          </a>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ opacity: 0.85 }}>
              Mode:&nbsp;
              <select
                value={mode}
                onChange={(e) => setMode(parseInt(e.target.value, 10) as 1 | 3 | 5)}
              >
                <option value={1}>1 question</option>
                <option value={3}>3 questions</option>
                <option value={5}>5 questions</option>
              </select>
            </label>

            <button
              onClick={startRound}
              style={{
                background: "#C1121F",
                color: "#fff",
                border: 0,
                padding: "10px 14px",
                borderRadius: 10,
                fontWeight: 900
              }}
            >
              START ROUND
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: 18,
            border: feedbackBorder
          }}
        >
          {feedbackLabel && (
            <div style={{ marginBottom: 10, fontWeight: 900, opacity: 0.95 }}>
              {feedbackLabel}
            </div>
          )}

          {status === "idle" && (
            <>
              <h1 style={{ margin: 0, fontSize: 34 }}>Quiz</h1>
              <p style={{ marginTop: 10, opacity: 0.85 }}>
                Press START ROUND. You have <b>{timePerQ}s</b> per question. If time runs out, it counts as wrong.
              </p>
              <p style={{ marginTop: 10, opacity: 0.85 }}>
                Questions source: <code>/questions.json</code>
              </p>
            </>
          )}

          {status === "playing" && current && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ opacity: 0.85 }}>
                  Question {idx + 1} / {round.length}
                </div>
                <div style={{ fontWeight: 900, fontSize: 22 }}>{timeLeft}s</div>
              </div>

              <h2 style={{ marginTop: 14, fontSize: 26 }}>{current.question}</h2>

              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10
                }}
              >
                {(["A", "B", "C", "D"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSelected(k)}
                    disabled={showFeedback}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      borderRadius: 14,
                      border: selected === k ? "2px solid #C1121F" : "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "#fff",
                      cursor: showFeedback ? "not-allowed" : "pointer",
                      opacity: showFeedback ? 0.75 : 1
                    }}
                  >
                    <div style={{ fontWeight: 900, opacity: 0.85 }}>{k}</div>
                    <div style={{ marginTop: 6 }}>{current.answers[k]}</div>
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => submitAnswer(selected, false)}
                  disabled={!selected || showFeedback}
                  style={{
                    background: selected && !showFeedback ? "#C1121F" : "rgba(255,255,255,0.12)",
                    color: "#fff",
                    border: 0,
                    padding: "12px 16px",
                    borderRadius: 12,
                    fontWeight: 900,
                    cursor: selected && !showFeedback ? "pointer" : "not-allowed"
                  }}
                >
                  LOCK IN
                </button>

                <div style={{ opacity: 0.8, alignSelf: "center" }}>
                  Correct so far: {correctCount}
                </div>
              </div>
            </>
          )}

          {status === "result" && (
            <>
              <h1 style={{ margin: 0, fontSize: 34 }}>Result</h1>
              <p style={{ marginTop: 10, fontSize: 18, opacity: 0.9 }}>
                Correct answers: <b>{correctCount}</b> / {mode}
              </p>

              <div
                style={{
                  marginTop: 14,
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 14,
                  padding: 14
                }}
              >
                <div style={{ opacity: 0.85 }}>Do this now:</div>
                <div style={{ marginTop: 6, opacity: 0.95, fontWeight: 900, fontSize: 20 }}>
                  {result.action}
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={startRound}
                  style={{
                    background: "#C1121F",
                    color: "#fff",
                    border: 0,
                    padding: "12px 16px",
                    borderRadius: 12,
                    fontWeight: 900
                  }}
                >
                  PLAY AGAIN
                </button>

                <a href="/" style={{ color: "#fff", opacity: 0.85, alignSelf: "center" }}>
                  Back to Home
                </a>
              </div>
            </>
          )}
        </div>

        {questions.length === 0 && (
          <p style={{ marginTop: 14, opacity: 0.7 }}>
            No questions loaded. Check <code>public/questions.json</code>.
          </p>
        )}
      </div>
    </main>
  );
}

