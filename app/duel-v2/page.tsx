"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  status: "waiting" | "playing" | "finished";
  current_q: number;
};

type Round = {
  round_index: number;
  resolved: boolean;
  started_at: string;
  duration_sec: number;
};

export default function DuelPage() {
  const searchParams = useSearchParams();
  const duelId = searchParams.get("id");

  const [room, setRoom] = useState<Room | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(10);

  // Poll backend
  useEffect(() => {
    if (!duelId) return;

    const interval = setInterval(async () => {
      // fetch room
      const { data: roomData } = await supabase
        .from("duel_rooms")
        .select("id,status,current_q")
        .eq("id", duelId)
        .single();

      if (!roomData) return;

      setRoom(roomData);

      // fetch round
      const { data: roundData } = await supabase
        .from("duel_rounds")
        .select("round_index,resolved,started_at,duration_sec")
        .eq("duel_id", duelId)
        .eq("round_index", roomData.current_q)
        .maybeSingle();

      if (roundData) {
        setRound(roundData);

        if (!roundData.resolved) {
          const start = new Date(roundData.started_at).getTime();
          const now = Date.now();
          const diff =
            roundData.duration_sec -
            Math.floor((now - start) / 1000);

          setTimeLeft(diff > 0 ? diff : 0);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [duelId]);

  if (!duelId) {
    return <div style={{ padding: 20 }}>No duel id provided.</div>;
  }

  if (!room) {
    return <div style={{ padding: 20 }}>Loading duel...</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Duel</h1>

      <p>Status: {room.status}</p>
      <p>Current Round: {room.current_q}</p>

      {round && !round.resolved && (
        <div>
          <h2>Round {round.round_index}</h2>
          <p>Time left: {timeLeft}</p>
        </div>
      )}

      {round && round.resolved && (
        <div>
          <h2>Round {round.round_index} resolved</h2>
        </div>
      )}

      {room.status === "finished" && (
        <h2>Game Finished</h2>
      )}
    </div>
  );
}
