"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

function makeCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function makeToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function DuelPage() {
  const [roomCode, setRoomCode] = useState<string>("");
  const [joinCode, setJoinCode] = useState<string>("");
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string>("");

  const playerToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    const key = "db_player_token";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const t = makeToken();
    window.localStorage.setItem(key, t);
    return t;
  }, []);

  async function createRoom() {
    setError("");
    setStatus("creating");

    const code = makeCode(5);

    // 1) create room
    const { error: roomErr } = await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0,
      question_ids: [],
    });

    if (roomErr) {
      console.log("createRoom: duel_rooms insert error", roomErr);
      setError(roomErr.message || "duel_rooms insert failed");
      setStatus("idle");
      return;
    }

    // 2) insert player p1
    const { error: playerErr } = await supabase.from("duel_players").insert({
      room_code: code,
      player_token: playerToken,
      slot: "p1",
      // kulcs: NE küldj null-t, inkább küldj értelmes timestampet
      joined_at: new Date().toISOString(),
    });

    if (playerErr) {
      console.log("createRoom: duel_players insert error", playerErr);
      setError(playerErr.message || "duel_players insert failed");
      setStatus("idle");
      return;
    }

    setRoomCode(code);
    setStatus("ready");
  }

  async function joinRoom() {
    setError("");
    setStatus("joining");

    const code = joinCode.trim().toUpperCase();

    if (!code) {
      setError("Please enter a room code.");
      setStatus("idle");
      return;
    }

    // 1) check room exists
    const { data: room, error: roomSelErr } = await supabase
      .from("duel_rooms")
      .select("code,status")
      .eq("code", code)
      .maybeSingle();

    if (roomSelErr) {
      console.log("joinRoom: duel_rooms select error", roomSelErr);
      setError(roomSelErr.message || "Room lookup failed");
      setStatus("idle");
      return;
    }
    if (!room) {
      setError("Room not found.");
      setStatus("idle");
      return;
    }

    // 2) check current players
    const { data: players, error: pSelErr } = await supabase
      .from("duel_players")
      .select("player_token,slot")
      .eq("room_code", code);

    if (pSelErr) {
      console.log("joinRoom: duel_players select error", pSelErr);
      setError(pSelErr.message || "Players lookup failed");
      setStatus("idle");
      return;
    }

    const alreadyIn = (players || []).some((p) => p.player_token === playerToken);
    if (alreadyIn) {
      setRoomCode(code);
      setStatus("ready");
      return;
    }

    if ((players || []).length >= 2) {
      setError("Room is full.");
      setStatus("idle");
      return;
    }

    const takenSlots = new Set((players || []).map((p) => p.slot));
    const slot = takenSlots.has("p1") ? "p2" : "p1";

    // 3) insert player
    const { error: insErr } = await supabase.from("duel_players").insert({
      room_code: code,
      player_token: playerToken,
      slot,
      joined_at: new Date().toISOString(),
    });

    if (insErr) {
      console.log("joinRoom: duel_players insert error", insErr);
      setError(insErr.message || "Join failed");
      setStatus("idle");
      return;
    }

    // 4) update room status to active (ha akarod)
    const { error: updErr } = await supabase
      .from("duel_rooms")
      .update({ status: "active" })
      .eq("code", code);

    if (updErr) {
      console.log("joinRoom: duel_rooms update error", updErr);
      // Nem állítom meg a flow-t ettől, mert a join már megtörtént
    }

    setRoomCode(code);
    setStatus("ready");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0B0B0D",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        <h1 style={{ margin: 0, fontSize: 40 }}>Duel Room</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>
          Create a room or join with a code. Two players per room.
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
          <button
            onClick={createRoom}
            disabled={status === "creating" || status === "joining"}
            style={{
              background: "#C1121F",
              border: "none",
              color: "#fff",
              padding: "12px 16px",
              borderRadius: 10,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {status === "creating" ? "Creating..." : "Create Duel Room"}
          </button>

          <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 260 }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter room code"
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff",
                padding: "12px 12px",
                borderRadius: 10,
                outline: "none",
              }}
            />
            <button
              onClick={joinRoom}
              disabled={status === "creating" || status === "joining"}
              style={{
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#fff",
                padding: "12px 14px",
                borderRadius: 10,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {status === "joining" ? "Joining..." : "Join"}
            </button>
          </div>
        </div>

        {roomCode && (
          <div style={{ marginTop: 18, background: "rgba(255,255,255,0.06)", padding: 14, borderRadius: 12 }}>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Room Code</div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2 }}>{roomCode}</div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, background: "rgba(193,18,31,0.22)", border: "1px solid rgba(193,18,31,0.35)", padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 800 }}>Error</div>
            <div style={{ opacity: 0.9, marginTop: 6 }}>{error}</div>
          </div>
        )}
      </div>
    </main>
  );
}
