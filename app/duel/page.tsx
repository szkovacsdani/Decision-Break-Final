"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";

type DuelRoom = {
  code: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
  question_ids: string[];
};

type DuelPlayer = {
  room_code: string;
  player_token: string;
  slot: "A" | "B";
};

type DuelSubmission = {
  room_code: string;
  q_index: number;
  slot: "A" | "B";
  guess: number;
  submitted_at: string;
};

type DuelResult = {
  room_code: string;
  q_index: number;
  answer: number;
  p1_guess: number | null;
  p2_guess: number | null;
  p1_diff: number | null;
  p2_diff: number | null;
  winner: "A" | "B";
};

function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function getRoomToken(code: string) {
  const key = `duel_token_${code}`;
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}

export default function DuelPage() {
  const [room, setRoom] = useState<DuelRoom | null>(null);
  const [players, setPlayers] = useState<DuelPlayer[]>([]);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [guess, setGuess] = useState("");
  const [submissions, setSubmissions] = useState<DuelSubmission[]>([]);
  const [result, setResult] = useState<DuelResult | null>(null);
  const [timeLeft, setTimeLeft] = useState(10);

  const pollRef = useRef<number>();

  const questionsMap = useMemo(() => {
    const map = new Map();
    duelQuestions.forEach((q: any) => map.set(q.id, q));
    return map;
  }, []);

  const currentQuestion =
    room && room.question_ids.length === 3
      ? questionsMap.get(room.question_ids[room.current_q])
      : null;

  useEffect(() => {
    if (!room || room.status !== "playing") return;
    setTimeLeft(10);
    const interval = setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [room?.current_q]);

  useEffect(() => {
    if (room && room.status === "playing" && timeLeft === 0) {
      autoSubmitTimeout();
    }
  }, [timeLeft]);

  function startPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => refresh(code), 800);
  }

  async function refresh(code: string) {
    const r = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", code)
      .single();

    if (!r.data) return;
    setRoom(r.data);

    const p = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    setPlayers(p.data || []);

    const s = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", code)
      .eq("q_index", r.data.current_q);

    setSubmissions(s.data || []);

    const rr = await supabase
      .from("duel_results")
      .select("*")
      .eq("room_code", code)
      .eq("q_index", r.data.current_q)
      .maybeSingle();

    setResult(rr.data || null);
  }

  async function createRoom() {
    const code = randomCode();
    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: [],
    });

    const token = getRoomToken(code);

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "A",
    });

    setMySlot("A");
    setRoomInput(code);
    refresh(code);
    startPolling(code);
  }

  async function joinRoom() {
    const code = roomInput.trim().toUpperCase();
    const token = getRoomToken(code);

    const p = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    if (p.data?.length === 1) {
      await supabase.from("duel_players").insert({
        room_code: code,
        player_token: token,
        slot: "B",
      });
      setMySlot("B");
    }

    refresh(code);
    startPolling(code);
  }

  async function submitGuess() {
    if (!room || !mySlot) return;
    if (!guess) return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(guess),
    });

    setGuess("");
  }

  async function autoSubmitTimeout() {
    if (!room || !mySlot) return;

    const already = submissions.find((s) => s.slot === mySlot);
    if (already) return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: -999999,
    });
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background:
          timeLeft <= 3 && room?.status === "playing"
            ? "radial-gradient(circle at center, rgba(255,0,0,0.35), #050505)"
            : "radial-gradient(1200px 600px at 20% 10%, rgba(255,0,0,0.18), transparent), #050505",
        color: "white",
        fontFamily: "system-ui",
        transition: "background 0.4s ease",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h1 style={{ fontSize: 40, fontWeight: 900 }}>Duel</h1>

        <div style={{ marginTop: 20 }}>
          <button onClick={createRoom}>Create Room</button>
          <input
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            placeholder="Room Code"
            style={{ marginLeft: 10 }}
          />
          <button onClick={joinRoom} style={{ marginLeft: 10 }}>
            Join
          </button>
        </div>

        {room && (
          <div style={{ marginTop: 30 }}>
            <div>Status: {room.status}</div>
            <div>Round: {room.current_q + 1}/3</div>

            {room.status === "playing" && currentQuestion && (
              <>
                <div
                  style={{
                    height: 8,
                    background: "rgba(255,255,255,0.1)",
                    marginTop: 20,
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(timeLeft / 10) * 100}%`,
                      background:
                        timeLeft <= 3
                          ? "linear-gradient(90deg,#ff0000,#aa0000)"
                          : "linear-gradient(90deg,#ff4d4d,#ff0000)",
                      transition: "width 1s linear",
                    }}
                  />
                </div>

                <div style={{ fontSize: 48, fontWeight: 900 }}>
                  {timeLeft}
                </div>

                <div style={{ marginTop: 20, fontSize: 20 }}>
                  {currentQuestion.q}
                </div>

                <input
                  value={guess}
                  onChange={(e) =>
                    setGuess(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="Your guess"
                  style={{ marginTop: 20 }}
                />
                <button onClick={submitGuess} style={{ marginLeft: 10 }}>
                  Submit
                </button>
              </>
            )}

            {result && (
              <div
                style={{
                  marginTop: 20,
                  padding: 20,
                  background:
                    result.winner === mySlot
                      ? "rgba(0,255,150,0.2)"
                      : "rgba(255,0,0,0.2)",
                }}
              >
                {result.winner === mySlot ? "You won round" : "You lost round"}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
