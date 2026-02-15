"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";

type Room = {
  code: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
  question_ids: string[];
};

type Submission = {
  slot: "A" | "B";
  guess: number;
  submitted_at: string;
};

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function DuelPage() {
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [guess, setGuess] = useState("");
  const [timer, setTimer] = useState(10);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [allResults, setAllResults] = useState<any[]>([]);

  const pollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const roundStartRef = useRef<number>(0);

  const questionsMap = useMemo(() => {
    const map = new Map();
    (duelQuestions as any[]).forEach(q => map.set(q.id, q));
    return map;
  }, []);

  function startPolling(code: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => refresh(code), 800);
  }

  function startTimer() {
    setTimer(10);
    roundStartRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleTimeout(); // 🔥 most mindig lefut
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  async function handleTimeout() {
    if (!room) return;

    const { data: subs } = await supabase
      .from("duel_submissions")
      .select("*")
      .eq("room_code", room.code)
      .eq("q_index", room.current_q);

    evaluateRound(room, subs || []); // 🔥 akkor is lezárjuk ha 0 vagy 1 válasz
  }

  async function createRoom() {
    const code = randomCode();

    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: []
    });

    const token = crypto.randomUUID();
    localStorage.setItem("duel_token", token);

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "A"
    });

    setMySlot("A");
    setRoomCode(code);
    startPolling(code);
  }

  async function joinRoom() {
    const token = crypto.randomUUID();
    localStorage.setItem("duel_token", token);

    await supabase.from("duel_players").insert({
      room_code: roomCode,
      player_token: token,
      slot: "B"
    });

    setMySlot("B");
    startPolling(roomCode);
  }

  async function refresh(code: string) {
    const { data: r } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", code)
      .single();

    if (!r) return;
    setRoom(r);

    if (r.status === "waiting") {
      const { data: players } = await supabase
        .from("duel_players")
        .select("*")
        .eq("room_code", code);

      if (players && players.length === 2) {
        const shuffled = (duelQuestions as any[])
          .sort(() => 0.5 - Math.random())
          .slice(0, 3)
          .map(q => q.id);

        await supabase
          .from("duel_rooms")
          .update({
            status: "playing",
            question_ids: shuffled
          })
          .eq("code", code);

        startTimer();
      }
    }

    if (r.status === "finished") {
      const { data: results } = await supabase
        .from("duel_results")
        .select("*")
        .eq("room_code", code);

      setAllResults(results || []);
    }
  }

  async function submitGuess() {
    if (!room || !mySlot || !guess) return;

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: room.current_q,
      slot: mySlot,
      guess: parseInt(guess)
    });

    setGuess("");
  }

  async function evaluateRound(r: Room, subs: Submission[]) {
    clearInterval(timerRef.current);

    const q = questionsMap.get(r.question_ids[r.current_q]);
    const answer = q.a;

    const subA = subs.find(s => s.slot === "A");
    const subB = subs.find(s => s.slot === "B");

    let winner: "A" | "B";

    if (!subA && !subB) {
      winner = "A"; // default tie-break safety
    } else if (!subA) {
      winner = "B";
    } else if (!subB) {
      winner = "A";
    } else {
      const diffA = Math.abs(subA.guess - answer);
      const diffB = Math.abs(subB.guess - answer);

      if (diffA < diffB) winner = "A";
      else if (diffB < diffA) winner = "B";
      else {
        winner =
          new Date(subA.submitted_at) <
          new Date(subB.submitted_at)
            ? "A"
            : "B";
      }
    }

    await supabase.from("duel_results").insert({
      room_code: r.code,
      q_index: r.current_q,
      winner
    });

    if (r.current_q >= 2) {
      await supabase
        .from("duel_rooms")
        .update({ status: "finished" })
        .eq("code", r.code);
    } else {
      await supabase
        .from("duel_rooms")
        .update({ current_q: r.current_q + 1 })
        .eq("code", r.code);

      startTimer();
    }
  }

  return (
    <div style={{ padding: 30, color: "white", background: "black", minHeight: "100vh" }}>
      <h1>Duel</h1>

      {!room && (
        <>
          <button onClick={createRoom}>Create Room</button>
          <br /><br />
          <input
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase())}
            style={{ background: "#111", color: "white" }}
          />
          <button onClick={joinRoom}>Join</button>
        </>
      )}

      {room && (
        <>
          <p>Room: {room.code}</p>
          <p>Status: {room.status}</p>

          <p>
            Player A (Room Creator) vs Player B (Join Player)
          </p>
          <p>
            You are: <strong>Player {mySlot}</strong>
          </p>

          {room.status === "finished" && allResults.length === 3 && (() => {
            const winsA = allResults.filter(r => r.winner === "A").length;
            const winsB = allResults.filter(r => r.winner === "B").length;
            const duelWinner = winsA > winsB ? "A" : "B";
            const duelLoser = duelWinner === "A" ? "B" : "A";
            const winnerWins = Math.max(winsA, winsB);

            return (
              <>
                <h2>Duel Finished</h2>
                <p>Final score: Player A {winsA} – Player B {winsB}</p>
                <p><strong>Winner: Player {duelWinner}</strong></p>
                <p><strong>Loser: Player {duelLoser}</strong></p>

                {winnerWins === 3 && (
                  <>
                    <p>Player {duelWinner} moves forward 3 spaces.</p>
                    <p>Player {duelLoser} moves back 1 space.</p>
                  </>
                )}

                {winnerWins === 2 && (
                  <>
                    <p>Player {duelWinner} moves forward 2 spaces.</p>
                    <p>Player {duelLoser} stays in place.</p>
                  </>
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
