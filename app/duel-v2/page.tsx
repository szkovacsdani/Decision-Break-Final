"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function DuelLobby() {
  const router = useRouter();

  const [roomCode, setRoomCode] = useState("");
  const [createdRoom, setCreatedRoom] = useState<any>(null);
  const [joinedRoom, setJoinedRoom] = useState<any>(null);

  async function createRoom() {
    const code = generateCode();

    const { data, error } = await supabase
      .from("duel_rooms")
      .insert({
        code,
        status: "waiting",
        current_q: 0,
        question_ids: [],
        round_active: false,
        scored: false,
      })
      .select()
      .single();

    if (error) {
      alert("Error creating room");
      return;
    }

    await supabase.from("duel_players").insert({
      duel_id: data.id,
      slot: "A",
      position: 0,
    });

    setCreatedRoom(data);
  }

  async function joinRoom() {
    const { data } = await supabase
      .from("duel_rooms")
      .select("*")
      .eq("code", roomCode.toUpperCase())
      .single();

    if (!data) {
      alert("Room not found");
      return;
    }

    await supabase.from("duel_players").insert({
      duel_id: data.id,
      slot: "B",
      position: 0,
    });

    setJoinedRoom(data);
  }

  async function startDuel() {
    if (!createdRoom) return;

    await supabase.rpc("start_duel", {
      p_duel_id: createdRoom.id,
    });

    router.push(`/duel-v2?id=${createdRoom.id}`);
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Duel Lobby</h1>

      <div style={{ marginBottom: 30 }}>
        <button onClick={createRoom}>Create Room</button>
      </div>

      {createdRoom && (
        <div>
          <p>Room Code: {createdRoom.code}</p>
          <button onClick={startDuel}>Start Duel</button>
        </div>
      )}

      <hr style={{ margin: "40px 0" }} />

      <div>
        <input
          placeholder="Enter Room Code"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
        />
        <button onClick={joinRoom}>Join Room</button>
      </div>

      {joinedRoom && (
        <p>Joined Room: {joinedRoom.code}</p>
      )}
    </div>
  );
}
