"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";

type DuelRoom = {
  code: string;
  status: string;
  current_q: number;
  question_ids: string[];
  round_started_at: string | null;
};

type DuelPlayer = {
  room_code: string;
  player_token: string;
  slot: "A" | "B";
};

type Submission = {
  room_code: string;
  q_index: number;
  slot: "A" | "B";
  guess: number;
  submitted_at: string;
};

type Result = {
  room_code: string;
  q_index: number;
  winner: "A" | "B";
  p1_guess: number | null;
  p2_guess: number | null;
  p1_time: number | null;
  p2_time: number | null;
};

const ROUND_TIME = 10;

function randomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function tokenForRoom(code: string) {
  const key = `db_token_${code}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const t = crypto.randomUUID();
  localStorage.setItem(key, t);
  return t;
}

export default function DuelPage() {
  const [room, setRoom] = useState<DuelRoom | null>(null);
  const [players, setPlayers] = useState<DuelPlayer[]>([]);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [guess, setGuess] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);

  const pollRef = useRef<any>(null);

  const questionsMap = useMemo(() => {
    const m = new Map();
    duelQuestions.forEach((q: any) => m.set(q.id, q));
    return m;
  }, []);

  function startPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => refresh(code), 700);
  }

  async function refresh(code: string) {
    const roomRes = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!roomRes.data) return;

    const r = roomRes.data;
    setRoom(r);

    const playersRes = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code);

    setPlayers(playersRes.data || []);

    const subs = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", code)
      .eq("q_index", r.current_q);

    setSubmissions(subs.data || []);

    const res = await supabase
      .from("duel_results")
      .select("*")
      .eq("room_code", code)
      .order("q_index");

    setResults(res.data || []);

    if (r.round_started_at && r.status === "playing") {
      const started = new Date(r.round_started_at).getTime();
      const diff = Math.floor((Date.now() - started) / 1000);
      const left = Math.max(ROUND_TIME - diff, 0);
      setTimeLeft(left);

      if (left === 0) {
        await finalizeRound(r);
      }
    }
  }

  async function createRoom() {
    const code = randomCode();
    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: [],
      round_started_at: null,
    });

    const token = tokenForRoom(code);
    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "A",
    });

    setMySlot("A");
    startPolling(code);
    refresh(code);
  }

  async function joinRoom() {
    const code = codeInput.trim().toUpperCase();
    const token = tokenForRoom(code);

    const existing = await supabase
      .from("duel_players")
      .select("*")
      .eq("room_code", code)
      .eq("player_token", token)
      .maybeSingle();

    if (!existing.data) {
      await supabase.from("duel_players").insert({
        room_code: code,
        player_token: token,
        slot: "B",
      });
    }

    setMySlot("B");
    startPolling(code);
    refresh(code);
  }

  async function startGameIfReady(r: DuelRoom) {
    if (players.length === 2 && r.status === "waiting") {
      const ids = duelQuestions
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map((q: any) => q.id);

      await supabase
        .from("duel_rooms")
        .update({
          status: "playing",
          question_ids: ids,
          round_started_at: new Date().toISOString(),
        })
        .eq("code", r.code);
    }
  }

  async function submit() {
    if (!room || !mySlot) return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: Number(guess),
    });

    setGuess("");
  }

  async function finalizeRound(r: DuelRoom) {
    const subs = submissions;

    const qId = r.question_ids[r.current_q];
    const correct = questionsMap.get(qId).a;

    const A = subs.find((s) => s.slot === "A");
    const B = subs.find((s) => s.slot === "B");

    let winner: "A" | "B";

    if (!A && !B) {
      winner = Math.random() > 0.5 ? "A" : "B";
    } else if (A && !B) {
      winner = "A";
    } else if (!A && B) {
      winner = "B";
    } else {
      const diffA = Math.abs(A!.guess - correct);
      const diffB = Math.abs(B!.guess - correct);

      if (diffA < diffB) winner = "A";
      else if (diffB < diffA) winner = "B";
      else {
        const timeA =
          new Date(A!.submitted_at).getTime() -
          new Date(r.round_started_at!).getTime();
        const timeB =
          new Date(B!.submitted_at).getTime() -
          new Date(r.round_started_at!).getTime();
        winner = timeA <= timeB ? "A" : "B";
      }
    }

    const p1Time = A
      ? Math.floor(
          (new Date(A.submitted_at).getTime() -
            new Date(r.round_started_at!).getTime()) /
            1000
        )
      : null;

    const p2Time = B
      ? Math.floor(
          (new Date(B.submitted_at).getTime() -
            new Date(r.round_started_at!).getTime()) /
            1000
        )
      : null;

    await supabase.from("duel_results").insert({
      room_code: r.code,
      q_index: r.current_q,
      winner,
      p1_guess: A?.guess ?? null,
      p2_guess: B?.guess ?? null,
      p1_time: p1Time,
      p2_time: p2Time,
    });

    if (r.current_q === 2) {
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

  if (!room)
    return (
      <div>
        <h1>Duel</h1>
        <button onClick={createRoom}>Create Room</button>
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
        />
        <button onClick={joinRoom}>Join</button>
      </div>
    );

  const roundWinsA = results.filter((r) => r.winner === "A").length;
  const roundWinsB = results.filter((r) => r.winner === "B").length;

  let movementText = "";

  if (room.status === "finished") {
    if (roundWinsA === 3) {
      movementText =
        "3-0 → Winner move forward 3 spaces, loser move back 1 space";
    } else if (roundWinsA === 2 || roundWinsB === 2) {
      movementText = "2-1 → Winner move forward 2 spaces";
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Duel</h1>
      <p>Room: {room.code}</p>
      <p>Status: {room.status}</p>
      <p>Player A (Room Creator) vs Player B (Join Player)</p>
      <p>You are: Player {mySlot}</p>

      {room.status === "playing" && (
        <>
          <p>
            {
              questionsMap.get(room.question_ids[room.current_q])
                ?.q
            }
          </p>
          <p>Time left: {timeLeft}s</p>
          <input
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
          />
          <button onClick={submit}>Submit</button>
        </>
      )}

      {results.map((r) => (
        <div key={r.q_index}>
          <p>
            Round {r.q_index + 1} winner: Player {r.winner}
          </p>
          <p>
            A guessed {r.p1_guess} in {r.p1_time}s | B guessed{" "}
            {r.p2_guess} in {r.p2_time}s
          </p>
        </div>
      ))}

      {room.status === "finished" && (
        <>
          <h2>Duel Finished</h2>
          <p>{movementText}</p>
        </>
      )}
    </div>
  );
}
