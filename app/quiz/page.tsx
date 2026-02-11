"use client";

import { useEffect, useMemo, useState } from "react";

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
  // Rules you finalized
  if (mode === 1) {
    if (correctCount === 1) return { delta: 1, action: "+1 point" };
    return { delta: 0, action: "0" };
  }

  if (mode === 3) {
    if (correctCount === 0) return { delta: -1, action: "-1 point" };
    if (correctCount === 1) return { delta: 1, action: "+1 point" };
    if (correctCount === 2) return { delta: 2, action: "+2 points" };
    return { delta: 3, action: "+3 points" };
  }

  // mode === 5
  if (correctCount === 0 || correctCount === 1)
    return { delta: -1, action: "-1 point" };
  if (correctCount === 2) return { delta: 1, action: "+1 point" };
  if (correctCount === 3) return { delta: 0, action: "Choose one player: -1" };
  if (correctCount === 4) return { delta: 3, action: "+3 points" };
  return { delta: 0, action: "All opponents: -2" };
}

export default function QuizPage() {
  const [mode, setMode] = useState<1 | 3 | 5>(3);
  const [timePerQ, setTimePerQ] = useState<number>(15);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [round, setRound] = useState<Question[]>([]);
  const [idx, setIdx] = useState<number>(0);

  const [selected, setSelected] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [answers, setAnswers] = useState<{ id: string; correct: boolean }[]>(
    []
  );
  const [status, setStatus] = useState<"idle" | "playing" | "result">("idle");
  const [timeLeft, setTimeLeft] = useState<number>(timePerQ);

  const current = useMemo(() => round[idx], [round, idx]);

  useEffect(() => {
    fetch("/questions.json")
      .then((r) => r.json())
      .then((data) => setQuestions((data?.questions || []) as Question[]))
      .catch(() => setQuestions([]));
  }, []);

  useEffect(() => {
    if (status !== "playing") return;
    if (!current) return;

    setTimeLeft(timePerQ);
    setSelected(null);

    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          submitAnswer(null, true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, idx]);

  function startRound() {
    const pool = shuffle(questions);
    const pick = pool.slice(0, mode);
    setRound(pick);
    setIdx(0);
    setAnswers([]);
    setSelected(null);
    setStatus("playing");
  }

  function submitAnswer(
    choice: "A" | "B" | "C" | "D" | null,
    isTimeout = false
  ) {
    if (!current) return;

    const correct = !isTimeout && choice !== null && choice === current.correct;
    setAnswers((prev) => [...prev, { id: current.id, correct }]);

    const next = idx + 1;
    if (next >= round.length) setStatus("result");
    else setIdx(next);
  }

  const correctCount = answers.filter((a) => a.correct).length;
  const result = scoreRound(mode, correctCount);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0B0B0D",
        color: "#fff",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <a
            href="/"
            style={{ color: "#fff", textDecoration: "none", opacity: 0.85 }}
          >
            ← Home
          </a>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label style={{ opacity: 0.85 }}>
              Mode:&nbsp;
              <select
                value={mode}
                onChange={(e) =>
                  setMode(parseInt(e.target.value, 10) as 1 | 3 | 5)
                }
              >
                <option value={1}>1 question</option>
                <option value={3}>3 questions</option>
                <option value={5}>5 questions</option>
              </select>
            </label>

            <label style={{ opacity: 0.85 }}>
              Timer:&nbsp;
              <select
                value={timePerQ}
                onChange={(e) => setTimePerQ(parseInt(e.target.value, 10))}
              >
                <option value={10}>10 sec</option>
                <option value={15}>15 sec</option>
                <option value={30}>30 sec</option>
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
                fontWeight: 900,
              }}
            >
              START
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: 18,
          }}
        >
          {status === "idle" && (
            <>
              <h1 style={{ margin: 0, fontSize: 34 }}>Quiz</h1>
              <p style={{ marginTop: 10, opacity: 0.85 }}>
                Press START. If time runs out, it counts as wrong.
              </p>
              <p style={{ marginTop: 10, opacity: 0.85 }}>
                Questions source: <code>/questions.json</code>
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
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 22,
                    color: timeLeft <= 5 ? "#C1121F" : "#fff",
                  }}
                >
                  {timeLeft}s
                </div>
              </div>

              <h2 style={{ marginTop: 14, fontSize: 26 }}>
                {current.question}
              </h2>

              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {(["A", "B", "C", "D"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSelected(k)}
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
                      cursor: "pointer",
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
                <button
                  onClick={() => submitAnswer(selected, false)}
                  disabled={!selected}
                  style={{
                    background: selected ? "#C1121F" : "rgba(255,255,255,0.12)",
                    color: "#fff",
                    border: 0,
                    padding: "12px 16px",
                    borderRadius: 12,
                    fontWeight: 900,
                    cursor: selected ? "pointer" : "not-allowed",
                  }}
                >
                  LOCK IN
                </button>

                <div style={{ opacity: 0.8, alignSelf: "center" }}>
                  Correct so far: {answers.filter((a) => a.correct).length}
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
                  padding: 14,
                }}
              >
                <div style={{ opacity: 0.85 }}>Outcome</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>
                  Score change: {result.delta}
                </div>
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  Action: {result.action}
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={startRound}
                  style={{
                    background: "#C1121F",
                    color: "#fff",
                    border: 0,
                    padding: "12px 16px",
                    borderRadius: 12,
                    fontWeight: 900,
                  }}
                >
                  PLAY AGAIN
                </button>

                <a
                  href="/"
                  style={{ color: "#fff", opacity: 0.85, alignSelf: "center" }}
                >
                  Back to Home
                </a>
              </div>
            </>
          )}
        </div>

        {questions.length === 0 && (
          <p style={{ marginTop: 14, opacity: 0.7 }}>
            No questions loaded. Check public/questions.json.
          </p>
        )}
      </div>
    </main>
  );
}
