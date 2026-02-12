"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type NormalizedAnswer = {
  text: string;
  correct: boolean;
};

type NormalizedQuestion = {
  question: string;
  answers: NormalizedAnswer[];
};

const QUESTION_COUNT_OPTIONS = [10, 20, 50, 100] as const;

export default function QuizPage() {
  const [rawQuestions, setRawQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedLocked, setSelectedLocked] = useState(false);

  const [questionLimit, setQuestionLimit] = useState<number>(100);

  const tickRef = useRef<HTMLAudioElement | null>(null);
  const buzzerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/questions.json")
      .then((r) => r.json())
      .then((data) => {
        const q = data?.questions ?? data ?? [];
        setRawQuestions(Array.isArray(q) ? q : []);
      })
      .catch(() => setRawQuestions([]));
  }, []);

  useEffect(() => {
    tickRef.current = new Audio(
      "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3"
    );
    buzzerRef.current = new Audio(
      "https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3"
    );
  }, []);

  function playSound(correct: boolean) {
    const audio = correct ? tickRef.current : buzzerRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  const normalizedAll: NormalizedQuestion[] = useMemo(() => {
    const toArray = (v: any) => {
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object") return Object.values(v);
      return [];
    };

    const normalizeAnswers = (q: any): NormalizedAnswer[] => {
      const rawAnswers =
        q?.answers ?? q?.options ?? q?.choices ?? q?.variants ?? q?.items;

      const correctText =
        q?.correctAnswer ?? q?.correct_answer ?? q?.correct ?? q?.rightAnswer;

      const correctIndex =
        typeof q?.correctIndex === "number"
          ? q.correctIndex
          : typeof q?.correct_index === "number"
          ? q.correct_index
          : typeof q?.answerIndex === "number"
          ? q.answerIndex
          : undefined;

      const arr = toArray(rawAnswers);

      if (arr.length > 0 && typeof arr[0] === "string") {
        return arr
          .map((t: string, i: number) => ({
            text: String(t),
            correct:
              (typeof correctIndex === "number" && i === correctIndex) ||
              (typeof correctText === "string" &&
                String(t) === String(correctText)),
          }))
          .filter((a) => a.text.trim().length > 0);
      }

      return arr
        .filter(Boolean)
        .map((a: any, i: number) => {
          const text = String(
            a?.text ?? a?.answer ?? a?.label ?? a?.value ?? ""
          );
          const correct =
            Boolean(
              a?.correct ?? a?.isCorrect ?? a?.is_correct ?? a?.right ?? false
            ) ||
            (typeof correctIndex === "number" && i === correctIndex) ||
            (typeof correctText === "string" && text === String(correctText));

          return { text, correct };
        })
        .filter((a) => a.text.trim().length > 0);
    };

    return (rawQuestions || [])
      .map((q: any) => {
        const questionText = String(q?.question ?? q?.q ?? q?.title ?? "");
        const answers = normalizeAnswers(q);

        return {
          question: questionText,
          answers,
        } as NormalizedQuestion;
      })
      .filter((q) => q.question.trim().length > 0);
  }, [rawQuestions]);

  const limitedQuestions = useMemo(() => {
    if (normalizedAll.length === 0) return [];
    const limit = Math.max(1, Math.min(questionLimit, normalizedAll.length));
    return normalizedAll.slice(0, limit);
  }, [normalizedAll, questionLimit]);

  const currentQuestion = useMemo(() => {
    return limitedQuestions[currentIndex] ?? null;
  }, [limitedQuestions, currentIndex]);

  const total = limitedQuestions.length;
  const isLoading = rawQuestions.length === 0 && normalizedAll.length === 0;
  const isFinished = !isLoading && (total === 0 || currentIndex >= total);

  function goNext() {
    setSelectedLocked(false);
    setCurrentIndex((prev) => prev + 1);
  }

  function restart() {
    setSelectedLocked(false);
    setCurrentIndex(0);
  }

  function handleAnswer(correct: boolean) {
    if (selectedLocked) return;
    setSelectedLocked(true);
    playSound(correct);

    setTimeout(() => {
      goNext();
    }, 450);
  }

  // UI helpers
  const headerRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  };

  const pillStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 12,
    background: "#1b1b1b",
    border: "1px solid #333",
    color: "#fff",
  };

  const smallBtnStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    background: "#1b1b1b",
    border: "1px solid #333",
    color: "#fff",
    cursor: "pointer",
  };

  const primaryBtnStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    background: "#fff",
    border: "1px solid #fff",
    color: "#111",
    cursor: "pointer",
  };

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2 style={{ marginBottom: 12 }}>Loading...</h2>
        <div style={{ opacity: 0.7, marginBottom: 18 }}>
          Check that <b>public/questions.json</b> exists.
        </div>
        <Link href="/" style={{ color: "#111", textDecoration: "underline" }}>
          Back to Home
        </Link>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 40,
          background: "#111",
          color: "#fff",
        }}
      >
        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
          <h1 style={{ marginBottom: 10 }}>Quiz complete</h1>

          <div style={{ opacity: 0.8, marginBottom: 22 }}>
            Total loaded questions: <b>{normalizedAll.length}</b>. Playing:{" "}
            <b>{total}</b>.
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button onClick={restart} style={primaryBtnStyle}>
              Restart
            </button>

            <Link
              href="/"
              style={{
                display: "inline-block",
                padding: "10px 12px",
                borderRadius: 12,
                background: "#1b1b1b",
                border: "1px solid #333",
                color: "#fff",
                textDecoration: "none",
              }}
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const safeAnswers = currentQuestion?.answers ?? [];
  const questionText = currentQuestion?.question ?? "";

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 40,
        background: "#111",
        color: "#fff",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={headerRowStyle}>
          <Link
            href="/"
            style={{ color: "#fff", textDecoration: "none", opacity: 0.85 }}
          >
            ← Home
          </Link>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={pillStyle}>
              Question {Math.min(currentIndex + 1, total)} / {total}
            </div>

            <div style={pillStyle}>
              Questions to play:{" "}
              <select
                value={questionLimit}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setQuestionLimit(v);
                  setCurrentIndex(0);
                  setSelectedLocked(false);
                }}
                style={{
                  marginLeft: 8,
                  padding: "6px 8px",
                  borderRadius: 10,
                  background: "#111",
                  color: "#fff",
                  border: "1px solid #333",
                }}
              >
                {QUESTION_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value={normalizedAll.length}>
                  All ({normalizedAll.length})
                </option>
              </select>
            </div>

            <button onClick={restart} style={smallBtnStyle}>
              Restart
            </button>
          </div>
        </div>

        <h1 style={{ marginTop: 28, marginBottom: 18, fontSize: 28 }}>
          {questionText}
        </h1>

        {safeAnswers.length === 0 ? (
          <div style={{ opacity: 0.9, lineHeight: 1.6 }}>
            <div style={{ marginBottom: 12 }}>
              This question has no valid answers in the JSON.
            </div>
            <div style={{ marginBottom: 16, opacity: 0.75 }}>
              Fix the structure under <b>answers</b> (recommended: array), or
              skip this question now.
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={goNext} style={primaryBtnStyle}>
                Skip question
              </button>
              <button onClick={restart} style={smallBtnStyle}>
                Restart from first
              </button>
            </div>

            <div style={{ marginTop: 18, opacity: 0.7, fontSize: 14 }}>
              Tip: put <b>questions.json</b> under <b>public</b> and ensure each
              question has <b>answers</b> as an array.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {safeAnswers.map((a, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(a.correct)}
                disabled={selectedLocked}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: selectedLocked ? "#151515" : "#1b1b1b",
                  border: "1px solid #333",
                  color: "#fff",
                  cursor: selectedLocked ? "not-allowed" : "pointer",
                  textAlign: "left",
                  fontSize: 16,
                  opacity: selectedLocked ? 0.7 : 1,
                }}
              >
                {a.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
