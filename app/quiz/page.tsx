"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Question = {
  id: string;
  category?: string;
  question: string;
  answers: { A: string; B: string; C: string; D: string };
  correct: "A" | "B" | "C" | "D";
};

type RoundType = "quizSpace" | "checkpoint";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// QUIZ SPACE pontozás: marad, ahogy eddig
function scoreQuizSpace(mode: 1 | 3 | 5, correctCount: number) {
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

  if (correctCount === 0 || correctCount === 1)
    return { action: "Move back 1 space." };
  if (correctCount === 2) return { action: "Move forward 1 space." };
  if (correctCount === 3)
    return { action: "Choose one player: they move back 1 space." };
  if (correctCount === 4) return { action: "Move forward 3 spaces." };
  return { action: "All opponents move back 2 spaces." };
}

// START/CHECKPOINT pontozás: fix 3 kérdés
function scoreCheckpoint(correctCount: number) {
  if (correctCount === 0) return { action: "Stay." };
  if (correctCount === 1) return { action: "Move forward 1 space." };
  if (correctCount === 2) return { action: "Move forward 2 spaces." };
  return { action: "Move forward 3 spaces." };
}

export default function QuizPage() {
  const router = useRouter();

  const [mode, setMode] = useState<1 | 3 | 5>(3); // Quiz Space-hez
  const timePerQ = 10;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [round, setRound] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);

  const [status, setStatus] = useState<"idle" | "playing" | "result">("idle");
  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [answers, setAnswers] = useState<{ id: string; correct: boolean }[]>(
    []
  );
  const [timeLeft, setTimeLeft] = useState(timePerQ);
  const [flash, setFlash] = useState(false);

  const [showFeedback, setShowFeedback] = useState(false);
  const [lastWasCorrect, setLastWasCorrect] = useState<boolean | null>(null);

  const [roundType, setRoundType] = useState<RoundType>("quizSpace");
  const [roundSize, setRoundSize] = useState<1 | 3 | 5>(3);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingRound, setPendingRound] = useState<Question[]>([]);

  const tickRef = useRef<HTMLAudioElement | null>(null);
  const buzzerRef = useRef<HTMLAudioElement | null>(null);
  const correctRef = useRef<HTMLAudioElement | null>(null);
  const wrongRef = useRef<HTMLAudioElement | null>(null);
  const victoryRef = useRef<HTMLAudioElement | null>(null);
  const current = useMemo(() => round[idx], [round, idx]);
  const correctCount = useMemo(
    () => answers.filter((a) => a.correct).length,
    [answers]
  );

  const result = useMemo(() => {
    if (roundType === "checkpoint") return scoreCheckpoint(correctCount);
    return scoreQuizSpace(roundSize, correctCount);
  }, [roundType, roundSize, correctCount]);
  useEffect(() => {
    if (status !== "result") return;

    const perfectQuiz =
      roundType === "quizSpace" && roundSize === 5 && correctCount === 5;

    const perfectCheckpoint = roundType === "checkpoint" && correctCount === 3;

    if (perfectQuiz || perfectCheckpoint) {
      setTimeout(() => {
        playVictory();
      }, 180);
    }
  }, [status, roundType, roundSize, correctCount]);

  useEffect(() => {
    fetch("/questions.json")
      .then((r) => r.json())
      .then((data) => setQuestions((data?.questions || []) as Question[]))
      .catch(() => setQuestions([]));
  }, []);
  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev === 1) return 0;
          return prev - 1;
        });
      }, 1000);

      return () => clearTimeout(timer);
    }

    // 0-nál indul a játék
    setRound(pendingRound);
    setIdx(0);
    setAnswers([]);
    setSelected(null);
    setShowFeedback(false);
    setLastWasCorrect(null);

    setStatus("playing");
    setCountdown(null);
  }, [countdown, pendingRound]);

  useEffect(() => {
    tickRef.current = new Audio(
      "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3"
    );

    buzzerRef.current = new Audio(
      "https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3"
    );

    correctRef.current = new Audio("/sounds/correct.mp3");
    wrongRef.current = new Audio("/sounds/wrong.mp3");
    victoryRef.current = new Audio("/sounds/victory.mp3");
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
  function playCorrect() {
    const a = correctRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  function playWrong() {
    const a = wrongRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }
  function playVictory() {
    const a = victoryRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  function startQuizSpaceRound() {
    if (questions.length === 0) return;

    const pool = shuffle(questions);
    const pick = pool.slice(0, mode);

    setRoundType("quizSpace");
    setRoundSize(mode);

    setPendingRound(pick);

    setIdx(0);
    setAnswers([]);
    setSelected(null);
    setShowFeedback(false);
    setLastWasCorrect(null);

    setCountdown(3);
  }

  function startCheckpointRound() {
    if (questions.length === 0) return;

    const pool = shuffle(questions);
    const pick = pool.slice(0, 3);

    setRoundType("checkpoint");
    setRoundSize(3);

    setPendingRound(pick);

    setIdx(0);
    setAnswers([]);
    setSelected(null);
    setShowFeedback(false);
    setLastWasCorrect(null);

    setCountdown(3);
  }

  function backHome() {
    router.push("/");
  }

  function goNextOrFinish(nextIdx: number, roundLen: number) {
    if (nextIdx >= roundLen) {
      setStatus("result");
      return;
    }

    setIdx(nextIdx);
  }

  function submitAnswer(
    choice: "A" | "B" | "C" | "D" | null,
    isTimeout: boolean
  ) {
    if (showFeedback) return;
    if (!current) return;

    const isCorrect =
      !isTimeout && choice !== null && choice === current.correct;
    if (isCorrect) {
      playCorrect();
    } else {
      playWrong();
    }

    setAnswers((prev) => [...prev, { id: current.id, correct: isCorrect }]);
    setLastWasCorrect(isCorrect);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);

      const nextIdx = idx + 1;
      goNextOrFinish(nextIdx, round.length);
    }, 900);
  }

  useEffect(() => {
    if (status !== "playing") return;
    if (!current) return;

    setTimeLeft(timePerQ);
    setSelected(null);

    const intervalId = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1;

        if (next <= 3 && next > 0) playTick();

        if (next <= 0) {
          clearInterval(intervalId);

          setFlash(true);
          playBuzzer();

          setTimeout(() => setFlash(false), 250);

          submitAnswer(null, true);
          return 0;
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [status, current]);

  const bg = flash
    ? "#ff0000"
    : timeLeft <= 3 && status === "playing"
    ? "#3a0000"
    : "#0B0B0D";

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

  const modeDisabled = status === "playing";

  return (
    <main
      style={{
        minHeight: "100vh",

        backgroundImage: "url('/images/hero-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",

        backgroundColor: status === "playing" ? bg : "transparent",
        transition: "background-color 0.15s ease",

        color: "#fff",
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: "rgba(20,20,20,.60)",
              backdropFilter: "blur(10px)",
              color: "#fff",
              textDecoration: "none",
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.10)",
              fontWeight: 700,
              transition: "0.2s",
            }}
          >
            ← Main menu
          </Link>

          {status === "playing" && (
            <div style={{ opacity: 0.75, fontWeight: 800 }}>
              {roundType === "checkpoint" ? "START/CHECKPOINT" : "QUIZ SPACE"}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 18,
            background: "rgba(20,20,20,.55)",
            backdropFilter: "blur(10px)",
            border: feedbackBorder,
            borderRadius: 18,
            padding: 24,
            boxShadow: "0 10px 40px rgba(0,0,0,.35)",
          }}
        >
          {feedbackLabel && (
            <div style={{ marginBottom: 10, fontWeight: 900, opacity: 0.95 }}>
              {feedbackLabel}
            </div>
          )}

          {status === "idle" && (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  style={{
                    background: "#1c8d37",
                    boxShadow:
                      "0 0 10px rgba(0,255,80,.45), 0 0 25px rgba(0,255,80,.35), 0 0 45px rgba(0,255,80,.20)",
                    color: "#fff",
                    border: 0,
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontWeight: 900,
                  }}
                >
                  QUIZ SPACE
                </button>

                <label
                  style={{
                    opacity: 0.85,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>Mode:</span>
                  <select
                    value={mode}
                    disabled={modeDisabled}
                    onChange={(e) =>
                      setMode(parseInt(e.target.value, 10) as 1 | 3 | 5)
                    }
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: 10,
                      padding: "8px 10px",
                      outline: "none",
                      fontWeight: 800,
                    }}
                  >
                    <option value={1} style={{ color: "#000" }}>
                      1 question
                    </option>
                    <option value={3} style={{ color: "#000" }}>
                      3 questions
                    </option>
                    <option value={5} style={{ color: "#000" }}>
                      5 questions
                    </option>
                  </select>
                </label>

                <button
                  onClick={startQuizSpaceRound}
                  style={{
                    background: "#1c8d37",
                    color: "#fff",
                    border: 0,
                    boxShadow:
                      "0 0 10px rgba(0,255,80,.45), 0 0 25px rgba(0,255,80,.35)",
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontWeight: 900,
                    cursor: questions.length === 0 ? "not-allowed" : "pointer",
                    opacity: questions.length === 0 ? 0.6 : 1,
                  }}
                  disabled={questions.length === 0}
                >
                  PLAY
                </button>
              </div>

              <p style={{ marginTop: 12, opacity: 0.85 }}>
                You have <b>{timePerQ}s</b> per question. If time runs out, it
                counts as wrong. When you punch play, the quiz starts.
              </p>
            </>
          )}

          {status === "playing" && current && (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div style={{ opacity: 0.85 }}>
                  Question {idx + 1} / {round.length}
                </div>
                <div style={{ fontWeight: 900, fontSize: 22 }}>{timeLeft}s</div>
              </div>

              <h2 style={{ marginTop: 14, fontSize: 26 }}>
                {current.question}
              </h2>

              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10,
                }}
              >
                {(["A", "B", "C", "D"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      if (showFeedback) return;

                      setSelected(k);
                      submitAnswer(k, false);
                    }}
                    disabled={showFeedback}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      borderRadius: 14,
                      border:
                        selected === k
                          ? "2px solid #C1121F"
                          : "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "#fff",
                      cursor: showFeedback ? "not-allowed" : "pointer",
                      opacity: showFeedback ? 0.75 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 900, opacity: 0.85 }}>{k}</div>
                    <div style={{ marginTop: 6 }}>{current.answers[k]}</div>
                  </button>
                ))}
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ opacity: 0.8, alignSelf: "center" }}>
                  Correct so far: {correctCount}
                </div>
              </div>
            </>
          )}
        </div>

        {status !== "playing" && (
          <div
            style={{
              marginTop: 14,
              background: "rgba(20,20,20,.55)",
              backdropFilter: "blur(10px)",
              borderRadius: 18,
              padding: 24,
              border: "1px solid rgba(255,255,255,.10)",
              boxShadow: "0 10px 40px rgba(0,0,0,.35)",
            }}
          >
            <button
              onClick={startCheckpointRound}
              style={{
                background: "#f97316",
                boxShadow:
                  "0 0 10px rgba(249,115,22,.45), 0 0 25px rgba(249,115,22,.35), 0 0 45px rgba(249,115,22,.20)",
                border: 0,
                padding: "12px 16px",
                borderRadius: 12,
                fontWeight: 900,
                cursor: questions.length === 0 ? "not-allowed" : "pointer",
                opacity: questions.length === 0 ? 0.6 : 1,
              }}
              disabled={questions.length === 0}
            >
              START / CHECKPOINT
            </button>

            <div style={{ marginTop: 12, opacity: 0.85, lineHeight: 1.5 }}>
              Fixed: <b>3 questions</b>. Scoring:
              <div style={{ marginTop: 8, opacity: 0.9 }}>
                0 correct: stay
                <br />
                1 correct: move forward 1 space
                <br />
                2 correct: move forward 2 spaces
                <br />3 correct: move forward 3 spaces
              </div>
            </div>
          </div>
        )}

        {status === "result" && (
          <>
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.92)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                textAlign: "center",
                animation: "fadeIn 0.35s ease",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  letterSpacing: 4,
                  opacity: 0.6,
                  marginBottom: 18,
                }}
              >
                ROUND RESULT
              </div>

              <div style={{ fontSize: 22, opacity: 0.8, marginBottom: 12 }}>
                {correctCount} / {roundSize} correct
              </div>

              <div
                style={{
                  fontSize: 52,
                  fontWeight: 900,
                  color: "#C1121F",
                  maxWidth: "85%",
                  lineHeight: 1.15,
                  animation: "popIn 0.35s ease",
                }}
              >
                {result.action.toUpperCase()}
              </div>

              <button
                onClick={backHome}
                style={{
                  marginTop: 38,
                  background: "#C1121F",
                  color: "#fff",
                  border: 0,
                  padding: "14px 22px",
                  borderRadius: 12,
                  fontWeight: 900,
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                Main menu
              </button>
            </div>

            <style jsx global>{`
              @keyframes fadeIn {
                from {
                  opacity: 0;
                }
                to {
                  opacity: 1;
                }
              }
              @keyframes popIn {
                from {
                  transform: scale(0.85);
                  opacity: 0;
                }
                to {
                  transform: scale(1);
                  opacity: 1;
                }
              }
            `}</style>
          </>
        )}

        {questions.length === 0 && (
          <p style={{ marginTop: 14, opacity: 0.7 }}>
            No questions loaded. Check <code>public/questions.json</code>.
          </p>
        )}
      </div>
      {countdown !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              fontSize: 220,
              fontWeight: 900,
              color: "#ff2a2a",
              textShadow:
                "0 0 20px rgba(255,0,0,.8), 0 0 50px rgba(255,0,0,.7), 0 0 90px rgba(255,0,0,.5)",
              userSelect: "none",
              animation: "countdownPop 1s ease",
            }}
          >
            {countdown === 0 ? null : countdown}
          </div>
        </div>
      )}
    </main>
  );
}
// deploy trigger
