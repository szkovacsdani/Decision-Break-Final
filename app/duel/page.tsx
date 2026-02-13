"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type DuelRoomRow = {
  id?: number;
  code: string;
  status: string; // "waiting" | "playing" | "finished"
  current_q?: number | null;
  question_ids?: any[] | null;
};

type DuelPlayerRow = {
  id?: number;
  room_code: string;
  player_token: string;
  slot: string; // "A" | "B"
  joined_at?: string;
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

export default function DuelPage() {
  const [loading, setLoading] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState<DuelRoomRow | null>(null);
  const [players, setPlayers] = useState<DuelPlayerRow[]>([]);
  const [myToken, setMyToken] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollTimerRef = useRef<number | null>(null);
  const lastAutoStartRef = useRef<string | null>(null);

  const playersCount = players.length;
  const isFull = playersCount >= 2;

  const derivedMySlot = useMemo(() => {
    if (!myToken) return null;
    const me = players.find((p) => p.player_token === myToken);
    if (!me) return null;
    return (me.slot as "A" | "B") || null;
  }, [players, myToken]);

  useEffect(() => {
    if (derivedMySlot) setMySlot(derivedMySlot);
  }, [derivedMySlot]);

  async function fetchRoomAndPlayers(code: string) {
    // Room
    const roomRes = await supabase
      .from("duel_rooms")
      .select("code,status,current_q,question_ids")
      .eq("code", code)
      .maybeSingle();

    if (roomRes.error) throw roomRes.error;
    if (!roomRes.data) throw new Error("Room not found");

    // Players
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

  async function ensureAutoStartIfReady(nextRoom: DuelRoomRow, nextPlayers: DuelPlayerRow[]) {
    // Ha már elindítottuk erre a code-ra, ne pörgesse végtelenül.
    if (lastAutoStartRef.current === nextRoom.code) return;

    const count = nextPlayers.length;
    const status = (nextRoom.status || "").toLowerCase();

    if (count === 2 && status === "waiting") {
      // Automatikus indítás
      const upd = await supabase
        .from("duel_rooms")
        .update({ status: "playing", current_q: 0 })
        .eq("code", nextRoom.code);

      if (!upd.error) {
        lastAutoStartRef.current = nextRoom.code;
      }
    }
  }

  async function refreshState(code: string) {
    try {
      const { room: r, players: ps } = await fetchRoomAndPlayers(code);
      setRoom(r);
      setPlayers(ps);
      setError(null);

      // Auto-start feltétel
      await ensureAutoStartIfReady(r, ps);
    } catch (e: any) {
      setError(e?.message || "Refresh failed");
    }
  }

  function startPolling(code: string) {
    stopPolling();
    pollTimerRef.current = window.setInterval(() => {
      refreshState(code);
    }, 1000);
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
      // Csak biztos, hogy van valami stabil "device token"
      getOrCreateDeviceToken();

      // Egyedi code keresés
      let code = randomCode(5);
      for (let i = 0; i < 5; i++) {
        const exists = await supabase.from("duel_rooms").select("code").eq("code", code).maybeSingle();
        if (!exists.error && !exists.data) break;
        code = randomCode(5);
      }

      // Room insert
      const insertRoom = await supabase.from("duel_rooms").insert({
        code,
        status: "waiting",
        current_q: 0,
        question_ids: [],
      });

      if (insertRoom.error) throw insertRoom.error;

      // Player token (szobához kötve)
      const token = getRoomScopedToken(code);
      setMyToken(token);

      // Slot A insert
      const insertPlayer = await supabase.from("duel_players").insert({
        room_code: code,
        player_token: token,
        slot: "A",
      });

      if (insertPlayer.error) throw insertPlayer.error;

      // State betöltés + polling
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

      // Room + Players
      const { room: r, players: ps } = await fetchRoomAndPlayers(code);

      // Ha már beléptél ezzel a böngészővel, csak töltsük be
      const token = getRoomScopedToken(code);
      setMyToken(token);

      const already = ps.find((p) => p.player_token === token);
      if (already) {
        setRoom(r);
        setPlayers(ps);
        startPolling(code);
        return;
      }

      // Full?
      if (ps.length >= 2) {
        throw new Error("Room is full (2/2).");
      }

      // Slot kiosztás
      const hasA = ps.some((p) => p.slot === "A");
      const hasB = ps.some((p) => p.slot === "B");
      let slot: "A" | "B" = "B";
      if (!hasA) slot = "A";
      else if (!hasB) slot = "B";

      // Insert player
      const insertPlayer = await supabase.from("duel_players").insert({
        room_code: code,
        player_token: token,
        slot,
      });

      if (insertPlayer.error) {
        // Ez fogott ki korábban: 400-as hibánál kell a pontos ok.
        // A Supabase error message így is hasznos lesz.
        throw insertPlayer.error;
      }

      // Frissítsünk azonnal
      await refreshState(code);
      startPolling(code);
    } catch (e: any) {
      setError(e?.message || "Join failed");
    } finally {
      setLoading(false);
    }
  }

  const statusLabel = (room?.status || "waiting").toLowerCase();

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 20px",
        background: "radial-gradient(1200px 600px at 20% 10%, rgba(255,0,0,0.18), transparent), #050505",
        color: "white",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: -1 }}>Duel Room</div>
        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 16 }}>
          Create a room or join with a code. Two players per room.
        </div>

        <div style={{ marginTop: 24, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={createRoom}
            disabled={loading}
            style={{
              height: 56,
              padding: "0 22px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "linear-gradient(180deg, rgba(220,20,60,1), rgba(170,0,30,1))",
              color: "white",
              fontSize: 18,
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating..." : "Create Duel Room"}
          </button>

          <input
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
            placeholder="Enter room code"
            style={{
              height: 56,
              width: 520,
              maxWidth: "100%",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
              padding: "0 16px",
              fontSize: 18,
              outline: "none",
            }}
          />

          <button
            onClick={joinRoom}
            disabled={loading}
            style={{
              height: 56,
              padding: "0 22px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontSize: 18,
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Join
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              border: "1px solid rgba(255,0,0,0.35)",
              background: "rgba(255,0,0,0.08)",
              fontWeight: 700,
            }}
          >
            Error: <span style={{ opacity: 0.9, fontWeight: 600 }}>{error}</span>
          </div>
        )}

        {room?.code && (
          <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <div
              style={{
                padding: 18,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ opacity: 0.7, fontWeight: 700 }}>Room Code</div>
              <div style={{ fontSize: 48, fontWeight: 900, marginTop: 6 }}>{room.code}</div>
            </div>

            <div
              style={{
                padding: 18,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
                <div>
                  <div style={{ opacity: 0.7, fontWeight: 700 }}>Status</div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{statusLabel}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontWeight: 700 }}>Players</div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                    {playersCount}/2
                  </div>
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontWeight: 700 }}>Your slot</div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{mySlot ?? "-"}</div>
                </div>
              </div>

              <div style={{ marginTop: 14, opacity: 0.75, fontWeight: 700 }}>Players in room:</div>

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {players.map((p) => (
                  <div
                    key={`${p.room_code}_${p.player_token}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(0,0,0,0.25)",
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 18 }}>Slot {p.slot}</div>
                    <div style={{ opacity: 0.7, fontWeight: 700, fontSize: 12 }}>
                      token: {p.player_token.slice(0, 8)}...
                    </div>
                  </div>
                ))}

                {players.length === 0 && (
                  <div style={{ opacity: 0.7, fontWeight: 700 }}>No players yet.</div>
                )}
              </div>

              {isFull && statusLabel === "playing" && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid rgba(0,255,160,0.22)",
                    background: "rgba(0,255,160,0.06)",
                    fontWeight: 900,
                  }}
                >
                  Duel started. Next step: show the first question and accept submissions.
                </div>
              )}

              {isFull && statusLabel === "waiting" && (
                <div style={{ marginTop: 14, opacity: 0.8, fontWeight: 800 }}>
                  Two players detected. Auto-start should switch status to playing within 1 second.
                </div>
              )}
            </div>

            <div style={{ opacity: 0.6, fontSize: 12 }}>
              Note: This version uses stable polling refresh (1s). Realtime subscriptions can be added later.
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
