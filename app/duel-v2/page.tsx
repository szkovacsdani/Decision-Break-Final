"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"

function getOrCreatePlayerToken() {
  let token = localStorage.getItem("player_token")
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem("player_token", token)
  }
  return token
}

type Phase = "waiting" | "active" | "resolving" | "finished"

export default function DuelPage() {
  const [playerToken, setPlayerToken] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState("")
  const [inputCode, setInputCode] = useState("")
  const [duel, setDuel] = useState<any>(null)
  const [round, setRound] = useState<any>(null)
  const [guess, setGuess] = useState("")
  const [phase, setPhase] = useState<Phase>("waiting")
  const [timer, setTimer] = useState<number>(10)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setPlayerToken(getOrCreatePlayerToken())
  }, [])

  // ---------------- CREATE ----------------

  async function createRoom() {
    if (!playerToken) return

    const { data } = await supabase.rpc("create_duel", {
      p_player: playerToken,
    })

    if (data) {
      const code = data[0].out_room_code
      setRoomCode(code)
      fetchDuel(code)
    }
  }

  // ---------------- JOIN ----------------

  async function joinRoom() {
    if (!playerToken || !inputCode) return

    await supabase.rpc("join_duel", {
      p_room_code: inputCode,
      p_player: playerToken,
    })

    setRoomCode(inputCode)
    fetchDuel(inputCode)
  }

  // ---------------- FETCH DUEL ----------------

  async function fetchDuel(code: string) {
    const { data } = await supabase
      .from("db_duels")
      .select("*")
      .eq("room_code", code)
      .single()

    if (!data) return

    setDuel(data)

    if (data.status === "playing") {
      fetchRound(data.id, data.current_round)
    }

    if (data.status === "waiting") {
      setPhase("waiting")
    }

    if (data.status === "finished") {
      setPhase("finished")
    }
  }

  // ---------------- FETCH ROUND ----------------

  async function fetchRound(duelId: string, roundNumber: number) {
    const { data } = await supabase
      .from("db_duel_rounds")
      .select("*")
      .eq("duel_id", duelId)
      .eq("round_number", roundNumber)
      .single()

    if (!data) return

    const { data: question } = await supabase
      .from("db_questions")
      .select("*")
      .eq("id", data.question_id)
      .single()

    setRound({ ...data, question })

    if (!data.resolved_at) {
      setPhase("active")
    }
  }

  // ---------------- GLOBAL POLLING (ALL STATES) ----------------

  useEffect(() => {
    if (!roomCode) return

    const interval = setInterval(() => {
      fetchDuel(roomCode)
    }, 2000)

    return () => clearInterval(interval)
  }, [roomCode])

  // ---------------- ACTIVE TIMER ----------------

  useEffect(() => {
    if (phase !== "active") return

    setTimer(10)

    if (intervalRef.current) clearInterval(intervalRef.current)

    intervalRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [round?.id, phase])

  // ---------------- AUTO RESOLVE ----------------

  useEffect(() => {
    if (phase !== "active") return
    if (timer !== 0) return
    if (!duel) return

    supabase.rpc("resolve_round", {
      p_duel_id: duel.id,
    })

    setPhase("resolving")
    setTimer(5)
  }, [timer])

  // ---------------- RESOLVING PHASE ----------------

  useEffect(() => {
    if (phase !== "resolving") return

    if (intervalRef.current) clearInterval(intervalRef.current)

    intervalRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          fetchDuel(roomCode)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [phase])

  // ---------------- SUBMIT ----------------

  async function submitGuess() {
    if (!duel || !round || !guess || !playerToken) return

    await supabase.from("db_duel_submissions").insert({
      id: crypto.randomUUID(),
      round_id: round.id,
      slot: duel.player_a === playerToken ? "A" : "B",
      guess: Number(guess),
      submitted_at: new Date().toISOString(),
    })

    setGuess("")
  }

  // ---------------- START BUTTON ----------------

  async function startDuel() {
    if (!duel) return

    await supabase.rpc("start_duel", {
      p_duel_id: duel.id,
    })

    fetchDuel(roomCode)
  }

  const isCreator = duel?.player_a === playerToken

  const canStart =
    duel?.status === "waiting" &&
    duel?.player_b &&
    isCreator

  // ---------------- UI ----------------

  return (
    <div style={{ padding: 40 }}>
      <h1>Decision Break Duel</h1>

      {!duel && (
        <>
          <button onClick={createRoom}>Create Room</button>

          <div style={{ marginTop: 20 }}>
            <input
              placeholder="Enter Room Code"
              value={inputCode}
              onChange={(e) =>
                setInputCode(e.target.value.toUpperCase())
              }
            />
            <button onClick={joinRoom}>Join</button>
          </div>
        </>
      )}

      {duel && (
        <>
          <h2>Room: {roomCode}</h2>
          <p>Status: {duel.status}</p>
          <p>
            Score A: {duel.score_a} | Score B: {duel.score_b}
          </p>

          {canStart && (
            <button onClick={startDuel}>
              Start Duel
            </button>
          )}

          {round && phase === "active" && (
            <>
              <h3>Round {duel.current_round}</h3>
              <p>{round.question?.question_text}</p>
              <p style={{ fontSize: 40 }}>{timer}</p>

              {timer > 0 && (
                <>
                  <input
                    type="number"
                    value={guess}
                    onChange={(e) =>
                      setGuess(e.target.value)
                    }
                  />
                  <button onClick={submitGuess}>
                    Submit
                  </button>
                </>
              )}
            </>
          )}

          {round && phase === "resolving" && (
            <>
              <h3>Round Result</h3>
              <p>
                Correct answer:{" "}
                {round.question?.correct_value}
              </p>
              <p>Next round in {timer}</p>
            </>
          )}

          {phase === "finished" && (
            <h2>Duel Finished</h2>
          )}
        </>
      )}
    </div>
  )
}
