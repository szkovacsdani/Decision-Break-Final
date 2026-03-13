"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
const supabase = getSupabase();

type DuelRoom = {
  id: string;
  status: string;
  current_q: number;
  round_active: boolean;
  round_started_at: string | null;
};

type DuelRound = {
  round_index: number;
  resolved: boolean;
  started_at: string;
  duration_sec: number;
};

export default function DuelPage({ params }: any) {
  const duelId = params.id;

  const [room, setRoom] = useState<DuelRoom | null>(null);
  const [round, setRound] = useState<DuelRound | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // 🔹 Polling loop
  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function tick() {
      // 1️⃣ backend resolve
      await supabase.rpc("resolve_round", { p_duel_id: duelId });

      // 2️⃣ fetch room
      const { data: roomData } = await supabase
        .from("duel_rooms")
        .select("*")
        .eq("id", duelId)
        .single();

      if (!roomData) return;
      setRoom(roomData);

      // 3️⃣ fetch current round
      const { data: roundData } = await supabase
        .from("duel_rounds")
        .select("*")
        .eq("duel_id", duelId)
        .eq("round_index", roomData.current_q)
        .single();

      if (roundData) {
        setRound(roundData);

        if (!roundData.resolved && roundData.started_at) {
          const end =
            new Date(roundData.started_at).getTime() +
            roundData.duration_sec * 1000;

          const now = Date.now();
          const remaining = Math.max(0, Math.floor((end - now) / 1000));
          setTimeLeft(remaining);
        } else {
          setTimeLeft(0);
        }
      }
    }

    tick();
    interval = setInterval(tick, 2000);

    return () => clearInterval(interval);
  }, [duelId]);

  if (!room) return <div>Loading...</div>;

  if (room.status === "finished") {
    return (
      <div style={{ padding: 20 }}>
        <h2>Duel Finished</h2>
        <p>Scoring applied.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Round {room.current_q}</h2>

      {round && !round.resolved && (
        <div>
          <p>Time left: {timeLeft}s</p>
        </div>
      )}

      {round && round.resolved && <p>Round resolved. Next round starting...</p>}
    </div>
  );
}
