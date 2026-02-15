"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";

type Room = {
  code: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
  question_ids: string[];
  round_started_at: string | null;
};

type Player = {
  player_token: string;
  slot: "A" | "B";
};

const ROUND_TIME = 10;

function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function getToken(key: string) {
  let t = localStorage.getItem(key);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(key, t);
  }
  return t;
}

export default function DuelPage() {
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [myGuess, setMyGuess] = useState("");
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [results, setResults] = useState<any[]>([]);
  const pollRef = useRef<number | null>(null);

  const questionMap = useMemo(() => {
    const m = new Map<string, any>();
    duelQuestions.forEach((q: any) => m.set(q.id, q));
    return m;
  }, []);

  function startPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => refresh(code), 1000);
  }

  async function refresh(code: string) {
    const { data } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!data) return;

    setRoom(data);

    const p = await supabase
      .from("duel_players")
      .select("player_token,slot")
      .eq("room_code", code);

    setPlayers(p.data || []);

    if (data.status === "playing" && data.round_started_at) {
      const diff =
        ROUND_TIME -
        Math.floor(
          (Date.now() - new Date(data.round_started_at).getTime()) / 1000
        );
      setTimeLeft(diff > 0 ? diff : 0);

      if (diff <= 0) handleTimeout(data);
    }

    if (data.status === "finished") {
      const r = await supabase
        .from("duel_results")
        .select("*")
        .eq("room_code", code)
        .order("q_index");
      setResults(r.data || []);
    }
  }

  async function createRoom() {
    const code = randomCode();
    const token = getToken("duel_token_" + code);

    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: [],
      round_started_at: null,
    });

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "A",
    });

    setMySlot("A");
    setRoomCodeInput(code);
    startPolling(code);
    refresh(code);
  }

  async function joinRoom() {
    const code = roomCodeInput.toUpperCase();
    const token = getToken("duel_token_" + code);

    const existing = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    if ((existing.data || []).length >= 2) return;

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "B",
    });

    setMySlot("B");

    await supabase
      .from("duel_rooms")
      .update({
        status: "playing",
        question_ids: duelQuestions
          .sort(() => 0.5 - Math.random())
          .slice(0, 3)
          .map((q: any) => q.id),
        round_started_at: new Date().toISOString(),
      })
      .eq("code", code);

    startPolling(code);
    refresh(code);
  }

  async function submitGuess() {
    if (!room || !mySlot || !myGuess) return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(myGuess),
    });

    setMyGuess("");
  }

  async function handleTimeout(r: Room) {
    const subs = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", r.code)
      .eq("q_index", r.current_q);

    if ((subs.data || []).length < 2) {
      await finalizeRound(r);
    }
  }

  async function finalizeRound(r: Room) {
    const qId = r.question_ids[r.current_q];
    const q = questionMap.get(qId);

    const subs = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", r.code)
      .eq("q_index", r.current_q);

    const A = subs.data?.find((s) => s.slot === "A");
    const B = subs.data?.find((s) => s.slot === "B");

    let winner: "A" | "B";

    if (!A && !B) winner = "A";
    else if (!A) winner = "B";
    else if (!B) winner = "A";
    else {
      const diffA = Math.abs(A.guess - q.a);
      const diffB = Math.abs(B.guess - q.a);
      winner = diffA <= diffB ? "A" : "B";
    }

    await supabase.from("duel_results").insert({
      room_code: r.code,
      q_index: r.current_q,
      winner,
    });

    if (r.current_q >= 2) {
      await supabase
        .from("duel_rooms")
        .update({ status: "finished" })
        .eq("code", r.code);
    } else {
      await supabase
        .from("duel_rooms")
        .update({
          current_q: r.current_q + 1,
          round_started_at: new Date().toISOString(),
        })
        .eq("code", r.code);
    }
  }

  const currentQuestion =
    room && room.question_ids.length === 3
      ? questionMap.get(room.question_ids[room.current_q])
      : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 40,
        background:
          "radial-gradient(circle at 30% 20%, #8b0000, #000 60%)",
        color: "white",
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontSize: 48, fontWeight: 900 }}>Duel</h1>

      {!room && (
        <div style={{ marginTop: 20 }}>
          <button onClick={createRoom}>Create Room</button>
          <div style={{ marginTop: 20 }}>
            <input
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value)}
              style={{ background: "#111", color: "#fff", padding: 10 }}
            />
            <button onClick={joinRoom}>Join</button>
          </div>
        </div>
      )}

      {room && (
        <div style={{ marginTop: 30 }}>
          <h2>Room: {room.code}</h2>
          <div>Status: {room.status}</div>

          {room.status === "playing" && currentQuestion && (
            <>
              <div style={{ marginTop: 20 }}>
                <strong>{currentQuestion.q}</strong>
              </div>
              <div>Time left: {timeLeft}s</div>
              <input
                value={myGuess}
                onChange={(e) =>
                  setMyGuess(e.target.value.replace(/[^0-9]/g, ""))
                }
                style={{
                  background: "#111",
                  color: "#fff",
                  padding: 10,
                  marginTop: 10,
                }}
              />
              <button onClick={submitGuess}>Submit</button>
            </>
          )}

          {room.status === "finished" && (
            <div style={{ marginTop: 20 }}>
              <h2>Duel Finished</h2>
              {results.map((r, i) => (
                <div key={i}>
                  Round {i + 1} winner: {r.winner}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
