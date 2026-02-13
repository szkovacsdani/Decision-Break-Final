"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

function makeCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function DuelPage() {
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(false);

  const [roomCode, setRoomCode] = useState<string>("");
  const [joinCode, setJoinCode] = useState("");

  const [status, setStatus] = useState<string>("");

  const canJoin = useMemo(() => joinCode.trim().length >= 4, [joinCode]);

  async function createRoom() {
    setLoadingCreate(true);
    setStatus("");
    try {
      const code = makeCode(5);

      // 1) room létrehozás
      const { error: roomErr } = await supabase.from("duel_rooms").insert({
        code,
        status: "waiting"
      });

      if (roomErr) {
        console.error("createRoom: duel_rooms insert error", roomErr);
        throw new Error(roomErr.message);
      }

      // 2) host player bejegyzés (prototípus)
      const { error: pErr } = await supabase.from("duel_players").insert({
        code,
        role: "host",
        ready: true
      });

      if (pErr) {
        console.error("createRoom: duel_players insert error", pErr);
        throw new Error(pErr.message);
      }

      setRoomCode(code);
      setStatus("Room created. Share the code with Player 2.");
    } catch (e: any) {
      alert("Create failed. Check console.");
      setStatus(`Create failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setLoadingCreate(false);
    }
  }

  async function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    setLoadingJoin(true);
    setStatus("");
    try {
      // 1) room létezik?
      const { data: room, error: selErr } = await supabase
        .from("duel_rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (selErr) {
        console.error("joinRoom: duel_rooms select error", selErr);
        throw new Error(selErr.message);
      }
      if (!room) {
        throw new Error("Room code not found.");
      }

      // 2) player már bent van?
      const { data: players, error: plSelErr } = await supabase
        .from("duel_players")
        .select("*")
        .eq("code", code);

      if (plSelErr) {
        console.error("joinRoom: duel_players select error", plSelErr);
        throw new Error(plSelErr.message);
      }

      if ((players?.length ?? 0) >= 2) {
        throw new Error("Room already has 2 players.");
      }

      // 3) join player insert
      const { error: insErr } = await supabase.from("duel_players").insert({
        code,
        role: "guest",
        ready: true
      });

      if (insErr) {
        console.error("joinRoom: duel_players insert error", insErr);
        throw new Error(insErr.message);
      }

      // 4) room státusz ready-re
      const { error: upErr } = await supabase
        .from("duel_rooms")
        .update({ status: "ready" })
        .eq("code", code);

      if (upErr) {
        console.error("joinRoom: duel_rooms update error", upErr);
        throw new Error(upErr.message);
      }

      setRoomCode(code);
      setStatus("Joined. Room is ready.");
    } catch (e: any) {
      console.error("joinRoom failed", e);
      alert("Join failed. Check console.");
      setStatus(`Join failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setLoadingJoin(false);
    }
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
        padding: 24
      }}
    >
      <div style={{ width: "100%", maxWidth: 760 }}>
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 16,
            padding: 18
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Duel Room</div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={createRoom}
              disabled={loadingCreate}
              style={{
                background: "#C1121F",
                color: "#fff",
                border: "none",
                padding: "14px 18px",
                borderRadius: 12,
                fontWeight: 900,
                cursor: loadingCreate ? "not-allowed" : "pointer"
              }}
            >
              {loadingCreate ? "Creating..." : "Create Duel Room"}
            </button>

            {roomCode ? (
              <div style={{ opacity: 0.9 }}>
                Room Code: <strong style={{ fontSize: 18 }}>{roomCode}</strong>
              </div>
            ) : null}
          </div>

          <div style={{ height: 14 }} />

          <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 8 }}>Join an existing room</div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="ABCDE"
              style={{
                width: 180,
                background: "rgba(0,0,0,0.35)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 10,
                padding: "12px 12px",
                outline: "none",
                fontWeight: 800,
                letterSpacing: 2
              }}
            />
            <button
              onClick={joinRoom}
              disabled={!canJoin || loadingJoin}
              style={{
                background: "transparent",
                color: "#7CFFB2",
                border: "1px solid rgba(124,255,178,0.45)",
                padding: "12px 16px",
                borderRadius: 12,
                fontWeight: 900,
                cursor: !canJoin || loadingJoin ? "not-allowed" : "pointer"
              }}
            >
              {loadingJoin ? "Joining..." : "Join"}
            </button>
          </div>

          <div style={{ marginTop: 14, opacity: 0.75, fontSize: 13 }}>
            Two players can use the same room code. If join fails, it is usually a policy or permission issue.
          </div>

          {status ? (
            <div style={{ marginTop: 12, opacity: 0.9, fontSize: 13 }}>
              Status: <strong>{status}</strong>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
