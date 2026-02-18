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
  const [roundHistory, setRoundHistory] = useState<any[]>([])
  const [guess, setGuess] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setPlayerToken(getOrCreatePlayerToken())
  }, [])

  // ---------------- CREATE ----------------

  async function createRoom() {
    if (!playerToken) return

    setLoading(true)

    const { data, error } = await supabase.rpc("create_duel", {
      p_player: playerToken,
    })

    console.log("CREATE RESPONSE:", data, error)

    if (!error && data) {
      const code = data[0].out_room_code
      setRoomCode(code)
      await fetchDuel(code)
    }

    setLoading(false)
  }

  // ---------------- JOIN ----------------

  async function joinRoom() {
    if (!playerToken || !inputCode) return

    setLoading(true)

    await supabase.rpc("join_duel", {
      p_room_code: inputCode,
      p_player: playerToken,
    })

    setRoomCode(inputCode)
    await fetchDuel(inputCode)

    setLoading(false)
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

    if (data.status === "finished") {
      fetchRoundHistory(data.id)
    }
  }

  // ---------------- FETCH ROUND ----------------

  async function fetchRound(duelId: string, roundNumber: number) {
    const { data } = await supabase
      .from("db_duel_rounds")
      .select("*, db_questions(*)")
      .eq("duel_id", duelId)
      .eq("round_number", roundNumber)
      .single()

    if (data) setRound(data)
  }

  // ---------------- FETCH ROUND HISTORY ----------------

  async function fetchRoundHistory(duelId: string) {
    const { data } = await supabase
      .from("db_duel_rounds")
      .select("*")
      .eq("duel_id", duelId)
      .order("round_number")

    if (data) setRoundHistory(data)
  }

  // ---------------- START ----------------

  async function startDuel() {
    if (!duel) {
      console.log("NO DUEL")
      return
    }
  
    console.log("START WITH ID:", duel.id)
  
    const { data, error } = await supabase.rpc("start_duel", {
      p_duel_id: duel.id,
    })
  
    console.log("START RESPONSE:", data, error)
  
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
        (Date.now() - new Date(round.started_at).getTime()) / 1000
      )

  // ---------------- BOARD ACTION ----------------

  function boardActionText() {
    if (!duel) return ""

    if (duel.score_a === 3)
      return "Player A → Move forward 2 spaces | Player B → Move back 1 space"

    if (duel.score_b === 3)
      return "Player B → Move forward 2 spaces | Player A → Move back 1 space"

    if (duel.score_a === 2)
      return "Player A → Move forward 1 space | Player B → Stay"

    if (duel.score_b === 2)
      return "Player B → Move forward 1 space | Player A → Stay"

    return "Draw → Both move forward 1 space"
  }

  const isCreator = duel?.created_by === playerToken

  const canStart =
    duel?.status === "waiting" &&
    duel?.player_a &&
    duel?.player_b &&
    isCreator

  const duelFinished = duel?.status === "finished"

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
              <p>{round.db_questions.question_text}</p>

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
                    {round.db_questions.correct_value}
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

          {duelFinished && (
            <>
              <h2>DUEL RESULT</h2>

              {roundHistory.map((r) => (
                <p key={r.id}>
                  Round {r.round_number}:{" "}
                  {r.winner_slot
                    ? r.winner_slot + " wins"
                    : "Draw"}
                </p>
              ))}

              <h3>
                Final Score: {duel.score_a} – {duel.score_b}
              </h3>

              <h3>{boardActionText()}</h3>
            </>
          )}
        </>
      )}
    </div>
  )
}
