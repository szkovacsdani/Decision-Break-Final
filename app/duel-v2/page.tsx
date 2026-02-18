"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

function getOrCreatePlayerToken() {
  let token = localStorage.getItem("player_token")
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem("player_token", token)
  }
  return token
}

export default function DuelPage() {
  const [playerToken, setPlayerToken] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState("")
  const [inputCode, setInputCode] = useState("")
  const [duel, setDuel] = useState<any>(null)
  const [round, setRound] = useState<any>(null)
  const [guess, setGuess] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setPlayerToken(getOrCreatePlayerToken())
  }, [])

  // ---------------- CREATE ----------------

  async function createRoom() {
    if (!playerToken) return

    const { data, error } = await supabase.rpc("create_duel", {
      p_player: playerToken,
    })

    if (!error && data) {
      const code = data[0].out_room_code
      setRoomCode(code)
      await fetchDuel(code)
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
    await fetchDuel(inputCode)
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

    setRound({
      ...data,
      question,
    })
  }

  // ---------------- START ----------------

  async function startDuel() {
    if (!duel) return

    await supabase.rpc("start_duel", {
      p_duel_id: duel.id,
    })

    await fetchDuel(roomCode)
  }

  // ---------------- SUBMIT ----------------

  async function submitGuess() {
    if (!duel || !guess || !playerToken) return

    await supabase.rpc("submit_guess", {
      p_duel_id: duel.id,
      p_player: playerToken,
      p_guess: Number(guess),
    })

    setGuess("")
  }

  // ---------------- POLLING ----------------

  useEffect(() => {
    if (!roomCode) return

    const interval = setInterval(() => {
      fetchDuel(roomCode)
    }, 2000)

    return () => clearInterval(interval)
  }, [roomCode])

  // ---------------- TIMER ----------------

  const timeLeft =
    round &&
    10 -
      Math.floor(
        (Date.now() - new Date(round.round_start_at).getTime()) /
          1000
      )

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
          <button onClick={createRoom} disabled={loading}>
            Create Room
          </button>

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
            <button onClick={startDuel}>Start Duel</button>
          )}

          {round && duel.status === "playing" && (
            <>
              <h3>Round {duel.current_round}</h3>

              <p>{round.question?.question_text}</p>

              {round.resolved_at ? (
                <>
                  <p>
                    Winner:{" "}
                    {round.winner_slot
                      ? round.winner_slot
                      : "Draw"}
                  </p>
                  <p>
                    Correct Answer:{" "}
                    {round.question?.correct_value}
                  </p>
                </>
              ) : (
                <>
                  <p
                    style={{
                      fontSize: 40,
                      color:
                        timeLeft <= 3
                          ? "red"
                          : timeLeft <= 5
                          ? "orange"
                          : "black",
                    }}
                  >
                    {timeLeft > 0 ? timeLeft : 0}
                  </p>

                  {timeLeft > 0 && (
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
            </>
          )}
        </>
      )}
    </div>
  )
}
