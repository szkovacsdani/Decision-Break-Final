"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// Fontos: legyen egy ilyen fájlod. A kérdések angolul vannak, válaszok egész számok.
// Példa elem: { "id":"DUEL-001", "q":"In which year was the Battle of Mohács?", "a":1526, "unit":"year" }
import duelQuestions from "@/data/questions/duel_estimates_en_v3_structured.json";
type DuelRoomRow = {
  code: string;
  status: string; // waiting | playing | finished
  current_q: number; // 0..2
  question_ids: any; // jsonb array
};

type DuelPlayerRow = {
  room_code: string;
  player_token: string;
  slot: "A" | "B";
  joined_at?: string;
};

type DuelQuestion = {
  id: string;
  q: string;
  a: number;
  unit?: string;
};

type DuelSubmissionRow = {
  room_code: string;
  q_index: number;
  slot: "A" | "B";
  guess: number;
  submitted_at: string; // timestamptz string
};

type DuelResultRow = {
  room_code: string;
  q_index: number;
  answer: number;
  p1_guess: number | null;
  p2_guess: number | null;
  p1_diff: number | null;
  p2_diff: number | null;
  winner: "A" | "B";
  created_at?: string;
};

function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function getOrCreateDeviceToken() {
  const key = "db_device_token";
  const existing = typeof window !== "undefined" ? localStorage.getItem(key) : null;
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(key, token);
  return token;
}

function getRoomScopedToken(roomCode: string) {
  const key = `db_room_token_${roomCode}`;
  const existing = typeof window !== "undefined" ? localStorage.getItem(key) : null;
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(key, token);
  return token;
}

function toIdsArray(question_ids: any): string[] {
  if (Array.isArray(question_ids)) return question_ids.filter(Boolean);
  return [];
}

function pick3UniqueQuestionIds(bank: DuelQuestion[]) {
  const ids = new Set<string>();
  const safe = bank.filter((x) => x && typeof x.id === "string");
  while (ids.size < 3 && safe.length > 0) {
    const q = safe[Math.floor(Math.random() * safe.length)];
    ids.add(q.id);
  }
  return Array.from(ids);
}

function abs(n: number) {
  return n < 0 ? -n : n;
}

function parseTsToMs(ts: string) {
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
const TIME_LIMIT_MS = 10000; // 10 seconds

export default function DuelPage() {
  const [loading, setLoading] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState<DuelRoomRow | null>(null);
  const [players, setPlayers] = useState<DuelPlayerRow[]>([]);
  const [myToken, setMyToken] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [myGuess, setMyGuess] = useState("");
  const [submissions, setSubmissions] = useState<DuelSubmissionRow[]>([]);
  const [roundResult, setRoundResult] = useState<DuelResultRow | null>(null);
  const [allResults, setAllResults] = useState<DuelResultRow[]>([]);

  const pollTimerRef = useRef<number | null>(null);
  const lastAutoStartRef = useRef<string | null>(null);
  const lastSeedRef = useRef<string | null>(null);
  const lastFinalizeRef = useRef<string | null>(null);
  const lastAdvanceRef = useRef<string | null>(null);

  const questionsById = useMemo(() => {
    const map = new Map<string, DuelQuestion>();
    (duelQuestions as DuelQuestion[]).forEach((q) => map.set(q.id, q));
    return map;
  }, []);

  const playersCount = players.length;
  const isFull = playersCount === 2;

  const derivedMySlot = useMemo(() => {
    if (!myToken) return null;
    const me = players.find((p) => p.player_token === myToken);
    return me?.slot ?? null;
  }, [players, myToken]);

  useEffect(() => {
    if (derivedMySlot) setMySlot(derivedMySlot);
  }, [derivedMySlot]);

  async function fetchRoomAndPlayers(code: string) {
    const roomRes = await supabase
      .from("duel_rooms")
      .select("code,status,current_q,question_ids")
      .eq("code", code)
      .maybeSingle();

    if (roomRes.error) throw roomRes.error;
    if (!roomRes.data) throw new Error("Room not found");

    const playersRes = await supabase
      .from("duel_players")
      .select("room_code,player_token,slot,joined_at")
      .eq("room_code", code)
      .order("joined_at", { ascending: true });

    if (playersRes.error) throw playersRes.error;

    return {
      room: roomRes.data as DuelRoomRow,
      players: (playersRes.data || []) as DuelPlayerRow[],
    };
  }

  async function fetchSubmissions(code: string, qIndex: number) {
    const res = await supabase
      .from("duel_submissions")
      .select("room_code,q_index,slot,guess,submitted_at")
      .eq("room_code", code)
      .eq("q_index", qIndex);

    if (res.error) throw res.error;
    return (res.data || []) as DuelSubmissionRow[];
  }

  async function fetchRoundResult(code: string, qIndex: number) {
    const res = await supabase
      .from("duel_results")
      .select("room_code,q_index,answer,p1_guess,p2_guess,p1_diff,p2_diff,winner,created_at")
      .eq("room_code", code)
      .eq("q_index", qIndex)
      .maybeSingle();

    if (res.error) throw res.error;
    return (res.data || null) as DuelResultRow | null;
  }

  async function fetchAllResults(code: string) {
    const res = await supabase
      .from("duel_results")
      .select("room_code,q_index,answer,p1_guess,p2_guess,p1_diff,p2_diff,winner,created_at")
      .eq("room_code", code)
      .order("q_index", { ascending: true });

    if (res.error) throw res.error;
    return (res.data || []) as DuelResultRow[];
  }

  async function ensureAutoStartIfReady(nextRoom: DuelRoomRow, nextPlayers: DuelPlayerRow[]) {
    if (lastAutoStartRef.current === nextRoom.code) return;

    const status = (nextRoom.status || "").toLowerCase();
    if (nextPlayers.length === 2 && status === "waiting") {
      const upd = await supabase
        .from("duel_rooms")
        .update({ status: "playing", current_q: 0 })
        .eq("code", nextRoom.code)
        .eq("status", "waiting");

      if (!upd.error) lastAutoStartRef.current = nextRoom.code;
    }
  }

  async function ensureSeedQuestions(nextRoom: DuelRoomRow, nextPlayers: DuelPlayerRow[]) {
    const status = (nextRoom.status || "").toLowerCase();
    if (nextPlayers.length !== 2) return;
    if (status !== "playing") return;

    const ids = toIdsArray(nextRoom.question_ids);
    if (ids.length === 3) return;

    const key = `${nextRoom.code}_seed`;
    if (lastSeedRef.current === key) return;

    const chosen = pick3UniqueQuestionIds(duelQuestions as DuelQuestion[]);
    const upd = await supabase
  .from("duel_rooms")
  .update({
    question_ids: chosen,
    question_started_at: new Date().toISOString()
  })
  .eq("code", nextRoom.code);


    if (!upd.error) lastSeedRef.current = key;
  }

  function computeWinnerFromSubs(q: DuelQuestion, subA: DuelSubmissionRow, subB: DuelSubmissionRow): DuelResultRow {
    const diffA = abs(subA.guess - q.a);
    const diffB = abs(subB.guess - q.a);

    let winner: "A" | "B";
    if (diffA < diffB) winner = "A";
    else if (diffB < diffA) winner = "B";
    else {
      const tA = parseTsToMs(subA.submitted_at);
      const tB = parseTsToMs(subB.submitted_at);
      winner = tA <= tB ? "A" : "B";
    }

    // p1 = A, p2 = B
    return {
      room_code: subA.room_code,
      q_index: subA.q_index,
      answer: q.a,
      p1_guess: subA.guess,
      p2_guess: subB.guess,
      p1_diff: diffA,
      p2_diff: diffB,
      winner,
    };
  }

  async function tryFinalizeRound(nextRoom: DuelRoomRow) {
    const status = (nextRoom.status || "").toLowerCase();
    if (status !== "playing") return;

    const code = nextRoom.code;
    const qIndex = nextRoom.current_q ?? 0;
    const ids = toIdsArray(nextRoom.question_ids);
    if (ids.length !== 3) return;

    const q = questionsById.get(ids[qIndex]);
    if (!q) return;
    // ---- TIME CHECK ----
const started = nextRoom.question_started_at;
if (!started) return;

const elapsed = Date.now() - new Date(started).getTime();
const isTimeUp = elapsed >= TIME_LIMIT_MS;

    const existing = await fetchRoundResult(code, qIndex);
    if (existing) {
      setRoundResult(existing);
      return;
    }

    const subs = await fetchSubmissions(code, qIndex);
setSubmissions(subs);

// ---- NORMAL CASE: 2 submissions before timeout ----
if (subs.length === 2) {
  const subA = subs.find((s) => s.slot === "A");
  const subB = subs.find((s) => s.slot === "B");
  if (!subA || !subB) return;

  const finalKey = `${code}_final_${qIndex}`;
  if (lastFinalizeRef.current === finalKey) return;

  const row = computeWinnerFromSubs(q, subA, subB);

  const ins = await supabase.from("duel_results").insert(row);
  if (!ins.error) {
    lastFinalizeRef.current = finalKey;
    setRoundResult(row);
  } else {
    const after = await fetchRoundResult(code, qIndex);
    if (after) setRoundResult(after);
  }

  return;
}

// ---- TIMEOUT CASE ----
if (!isTimeUp) return;

const timeoutKey = `${code}_timeout_${qIndex}`;
if (lastFinalizeRef.current === timeoutKey) return;

let winner: "A" | "B";

// 1 submission -> submitter wins
if (subs.length === 1) {
  winner = subs[0].slot;
}
// 0 submissions -> random winner
else {
  winner = Math.random() < 0.5 ? "A" : "B";
}

const row: DuelResultRow = {
  room_code: code,
  q_index: qIndex,
  answer: q.a,
  p1_guess: subs.find((s) => s.slot === "A")?.guess ?? null,
  p2_guess: subs.find((s) => s.slot === "B")?.guess ?? null,
  p1_diff: null,
  p2_diff: null,
  winner,
};

const insertResult = await supabase.from("duel_results").insert(row);

if (!insertResult.error) {
  lastFinalizeRef.current = timeoutKey;
    setRoundResult(row);
} else {
  const after = await fetchRoundResult(code, qIndex);
  if (after) setRoundResult(after);
}

    const subA = subs.find((s) => s.slot === "A");
    const subB = subs.find((s) => s.slot === "B");
    if (!subA || !subB) return;

    const finalKey = `${code}_final_${qIndex}`;
if (lastFinalizeRef.current === finalKey) return;

    const row = computeWinnerFromSubs(q, subA, subB);

    // Unique(room_code,q_index) miatt race-safe: az egyik nyer, a másik hibát kap, de következő poll betölti.
    const ins = await supabase.from("duel_results").insert(row);
    if (!ins.error) {
      lastFinalizeRef.current = finalKey;
            setRoundResult(row);
    } else {
      // Ha már beszúrta a másik fél, csak beolvassuk.
      const after = await fetchRoundResult(code, qIndex);
      if (after) setRoundResult(after);
    }
  }

  async function tryAdvanceOrFinish(nextRoom: DuelRoomRow) {
    const status = (nextRoom.status || "").toLowerCase();
    if (status !== "playing") return;

    const code = nextRoom.code;
    const qIndex = nextRoom.current_q ?? 0;

    const rr = await fetchRoundResult(code, qIndex);
    if (!rr) return;

    const advanceKey = `${code}_adv_${qIndex}`;
if (lastAdvanceRef.current === advanceKey) return;

    if (qIndex >= 2) {
      const upd = await supabase
        .from("duel_rooms")
        .update({ status: "finished" })
        .eq("code", code)
        .eq("status", "playing");

      if (!upd.error) lastAdvanceRef.current = key;
      return;
    }

    const upd = await supabase
  .from("duel_rooms")
  .update({
    current_q: qIndex + 1,
    question_started_at: new Date().toISOString()
  })
  .eq("code", code)
  .eq("current_q", qIndex)
  .eq("status", "playing");


    if (!upd.error) {
      lastAdvanceRef.current = advanceKey;
      setMyGuess("");
      setRoundResult(null);
      setSubmissions([]);
    }
  }

  async function refreshState(code: string) {
    try {
      const { room: r, players: ps } = await fetchRoomAndPlayers(code);
      setRoom(r);
      setPlayers(ps);
      setError(null);

      await ensureAutoStartIfReady(r, ps);

      // Re-fetch after possible status flip
      const { room: r2, players: ps2 } = await fetchRoomAndPlayers(code);
      setRoom(r2);
      setPlayers(ps2);

      await ensureSeedQuestions(r2, ps2);

      // Re-fetch after possible seeding
      const { room: r3, players: ps3 } = await fetchRoomAndPlayers(code);
      setRoom(r3);
      setPlayers(ps3);

      const status = (r3.status || "").toLowerCase();
      const qIndex = r3.current_q ?? 0;

      if (status === "playing") {
        const subs = await fetchSubmissions(code, qIndex);
        setSubmissions(subs);

        const rr = await fetchRoundResult(code, qIndex);
        setRoundResult(rr);

        await tryFinalizeRound(r3);
        await tryAdvanceOrFinish(r3);
      }

      if (status === "finished") {
        const results = await fetchAllResults(code);
        setAllResults(results);
      }
    } catch (e: any) {
      setError(e?.message || "Refresh failed");
    }
  }

  function startPolling(code: string) {
    stopPolling();
    pollTimerRef.current = window.setInterval(() => refreshState(code), 700);
  }

  function stopPolling() {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  async function createRoom() {
    setLoading(true);
    setError(null);

    try {
      getOrCreateDeviceToken();

      let code = randomCode(5);
      for (let i = 0; i < 5; i++) {
        const exists = await supabase.from("duel_rooms").select("code").eq("code", code).maybeSingle();
        if (!exists.error && !exists.data) break;
        code = randomCode(5);
      }

      const insertRoom = await supabase.from("duel_rooms").insert({
        code,
        status: "waiting",
        current_q: 0,
        question_ids: [],
      });

      if (insertRoom.error) throw insertRoom.error;

      const token = getRoomScopedToken(code);
      setMyToken(token);

      const insertPlayer = await supabase.from("duel_players").insert({
        room_code: code,
        player_token: token,
        slot: "A",
      });

      if (insertPlayer.error) throw insertPlayer.error;

      await refreshState(code);
      setRoomCodeInput(code);
      startPolling(code);
    } catch (e: any) {
      setError(e?.message || "Create room failed");
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    setLoading(true);
    setError(null);

    const code = roomCodeInput.trim().toUpperCase();
    if (!code) {
      setLoading(false);
      setError("Please enter a room code.");
      return;
    }

    try {
      getOrCreateDeviceToken();

      const { room: r, players: ps } = await fetchRoomAndPlayers(code);

      const token = getRoomScopedToken(code);
      setMyToken(token);

      const already = ps.find((p) => p.player_token === token);
      if (already) {
        setRoom(r);
        setPlayers(ps);
        startPolling(code);
        return;
      }

      if (ps.length >= 2) throw new Error("Room is full (2/2).");

      const hasA = ps.some((p) => p.slot === "A");
      const hasB = ps.some((p) => p.slot === "B");
      let slot: "A" | "B" = "B";
      if (!hasA) slot = "A";
      else if (!hasB) slot = "B";

      const insertPlayer = await supabase.from("duel_players").insert({
        room_code: code,
        player_token: token,
        slot,
      });

      if (insertPlayer.error) throw insertPlayer.error;

      await refreshState(code);
      startPolling(code);
    } catch (e: any) {
      setError(e?.message || "Join failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitGuess() {
    if (!room?.code || !mySlot) return;

    const status = (room.status || "").toLowerCase();
    if (status !== "playing") return;

    const qIndex = room.current_q ?? 0;
    const n = parseInt(myGuess, 10);

    if (!Number.isFinite(n)) {
      setError("Please enter a whole number.");
      return;
    }

    setError(null);

    const ins = await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: qIndex,
      slot: mySlot,
      guess: n,
    });

    if (ins.error) {
      setError("You already submitted for this round.");
      return;
    }

    await refreshState(room.code);
  }

  const statusLabel = (room?.status || "waiting").toLowerCase();
  const qIndex = room?.current_q ?? 0;

  const qIds = room ? toIdsArray(room.question_ids) : [];
  const currentQuestionId = qIds.length === 3 ? qIds[qIndex] : null;
  const currentQuestion = currentQuestionId ? questionsById.get(currentQuestionId) : null;

  const mySubmitted = mySlot ? submissions.some((s) => s.slot === mySlot) : false;
  const oppSubmitted = mySlot ? submissions.some((s) => s.slot !== mySlot) : false;

  const finalSummary = useMemo(() => {
    if (!room || statusLabel !== "finished") return null;
    if (allResults.length < 3) return null;

    const winsA = allResults.filter((r) => r.winner === "A").length;
    const winsB = 3 - winsA;
    const duelWinner: "A" | "B" = winsA > winsB ? "A" : "B";
    const winnerWins = duelWinner === "A" ? winsA : winsB;

    let winnerMove = 0;
    let loserMove = 0;
    if (winnerWins === 3) {
      winnerMove = 3;
      loserMove = -1;
    } else if (winnerWins === 2) {
      winnerMove = 2;
      loserMove = 0;
    }

    return { winsA, winsB, duelWinner, winnerMove, loserMove };
  }, [room, statusLabel, allResults]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "28px 16px",
        background: "radial-gradient(1200px 600px at 20% 10%, rgba(255,0,0,0.18), transparent), #050505",
        color: "white",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: -1 }}>Duel</div>
        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 14 }}>
        2 devices, 3 rounds. The closest guess wins. If both differences are equal, the faster submission wins.
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={createRoom}
            disabled={loading}
            style={{
              height: 52,
              padding: "0 18px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "linear-gradient(180deg, rgba(220,20,60,1), rgba(170,0,30,1))",
              color: "white",
              fontSize: 16,
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating..." : "Create Room"}
          </button>

          <input
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
            placeholder="Enter room code"
            style={{
              height: 52,
              width: 360,
              maxWidth: "100%",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
              padding: "0 14px",
              fontSize: 16,
              outline: "none",
            }}
          />

          <button
            onClick={joinRoom}
            disabled={loading}
            style={{
              height: 52,
              padding: "0 18px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontSize: 16,
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Join
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,0,0,0.35)",
              background: "rgba(255,0,0,0.08)",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            Error: <span style={{ opacity: 0.9, fontWeight: 700 }}>{error}</span>
          </div>
        )}

        {room?.code && (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ opacity: 0.7, fontWeight: 800, fontSize: 12 }}>Room Code</div>
              <div style={{ fontSize: 40, fontWeight: 900, marginTop: 4 }}>{room.code}</div>

              <div style={{ marginTop: 10, display: "flex", gap: 18, flexWrap: "wrap" }}>
                <div>
                  <div style={{ opacity: 0.7, fontWeight: 800, fontSize: 12 }}>Status</div>
                  <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{statusLabel}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontWeight: 800, fontSize: 12 }}>Players</div>
                  <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{playersCount}/2</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontWeight: 800, fontSize: 12 }}>Your slot</div>
                  <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{mySlot ?? "-"}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontWeight: 800, fontSize: 12 }}>Round</div>
                  <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>
                    {statusLabel === "playing" ? `${qIndex + 1}/3` : "-"}
                  </div>
                </div>
              </div>
            </div>

            {isFull && statusLabel === "playing" && currentQuestion && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.25)",
                }}
              >
                <div style={{ opacity: 0.7, fontWeight: 900, fontSize: 12 }}>
                  ROUND {qIndex + 1} OF 3
                </div>

                <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>
                  {currentQuestion.q}
                </div>

                <div style={{ marginTop: 6, opacity: 0.75, fontWeight: 800, fontSize: 13 }}>
                  Answer with a whole number{currentQuestion.unit ? ` (${currentQuestion.unit})` : ""}.
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Enter your guess"
                    value={myGuess}
                    onChange={(e) => setMyGuess(e.target.value.replace(/[^0-9]/g, ""))}
                    disabled={mySubmitted}
                    style={{
                      height: 54,
                      width: 260,
                      maxWidth: "100%",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "white",
                      padding: "0 14px",
                      fontSize: 18,
                      outline: "none",
                      fontWeight: 900,
                    }}
                  />

                  <button
                    onClick={submitGuess}
                    disabled={mySubmitted}
                    style={{
                      height: 54,
                      padding: "0 18px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: mySubmitted
                        ? "rgba(255,255,255,0.06)"
                        : "linear-gradient(180deg, rgba(220,20,60,1), rgba(170,0,30,1))",
                      color: "white",
                      fontSize: 16,
                      fontWeight: 900,
                      cursor: mySubmitted ? "not-allowed" : "pointer",
                    }}
                  >
                    {mySubmitted ? "Submitted" : "Submit"}
                  </button>

                  <div style={{ marginLeft: 4, opacity: 0.75, fontWeight: 900, fontSize: 13 }}>
                    Submissions: {submissions.length}/2 {" | "}
                    You: {mySubmitted ? "submitted" : "waiting"} {" | "}
                    Opponent: {oppSubmitted ? "submitted" : "waiting"}
                  </div>
                </div>

                {roundResult && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      borderRadius: 14,
                      border: "1px solid rgba(0,255,160,0.22)",
                      background: "rgba(0,255,160,0.06)",
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 16 }}>Round winner: {roundResult.winner}</div>
                    <div style={{ marginTop: 6, opacity: 0.85, fontWeight: 800, fontSize: 13 }}>
                      diff A: {roundResult.p1_diff} | diff B: {roundResult.p2_diff}
                    </div>
                    <div style={{ marginTop: 8, opacity: 0.75, fontWeight: 900, fontSize: 12 }}>
                      Next round will auto-advance.
                    </div>
                  </div>
                )}
              </div>
            )}

            {isFull && statusLabel === "waiting" && (
              <div style={{ marginTop: 4, opacity: 0.85, fontWeight: 900 }}>
                Two players detected. Auto-start will switch to playing.
              </div>
            )}

            {statusLabel === "finished" && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 900 }}>Duel Finished</div>

                {finalSummary ? (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>Rounds won: A {finalSummary.winsA} | B {finalSummary.winsB}</div>
                    <div style={{ fontWeight: 900 }}>Duel winner: {finalSummary.duelWinner}</div>
                    <div style={{ marginTop: 6, padding: 12, borderRadius: 14, background: "rgba(0,0,0,0.25)" }}>
                      <div style={{ fontWeight: 900 }}>Movement</div>
                      <div style={{ marginTop: 6, opacity: 0.85, fontWeight: 800 }}>
                        Winner move: +{finalSummary.winnerMove} tiles
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.85, fontWeight: 800 }}>
                        Loser move: {finalSummary.loserMove} tiles
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, opacity: 0.8, fontWeight: 900 }}>
                    Loading results...
                  </div>
                )}
              </div>
            )}

            <div style={{ opacity: 0.6, fontSize: 12 }}>
              Polling: 700ms. Döntetlen diff esetén a szerver oldali submitted_at idő dönt.
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
