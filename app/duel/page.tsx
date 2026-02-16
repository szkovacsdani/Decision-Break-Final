"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

type RoomStatus = "waiting" | "playing" | "finished"

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export default function DuelPage() {
  const [roomCode, setRoomCode] = useState("")
  const [room, setRoom] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [mySlot, setMySlot] = useState<"A" | "B" | null>(null)

  const [timer, setTimer] = useState(10)
  const [roundClosed, setRoundClosed] = useState(false)
  const [guess, setGuess] = useState("")
  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)

  const pollRef = useRef<any>(null)
  const timerRef = useRef<any>(null)

  const correctAnswer = 100
  const currentQIndex = 0

  useEffect(() => {
    return () => {
      clearInterval(pollRef.current)
      clearInterval(timerRef.current)
    }
  }, [])

  // ---------------- CREATE ROOM ----------------

  async function createRoom() {
    const code = randomCode()
    const token = crypto.randomUUID()

    localStorage.setItem("duel_token", token)

    await supabase.from("duel_rooms").insert({
      code,
      status: "waiting",
      current_q: 0
    })

    await supabase.from("duel_players").insert({
      room_code: code,
      player_token: token,
      slot: "A"
    })

    setMySlot("A")
    setRoomCode(code)
    startPolling(code)
  }

  // ---------------- JOIN ROOM ----------------

  async function joinRoom() {
    const token = crypto.randomUUID()

    localStorage.setItem("duel_token", token)

    await supabase.from("duel_players").insert({
      room_code: roomCode,
      player_token: token,
      slot: "B"
    })

    setMySlot("B")
    startPolling(roomCode)
  }

  // ---------------- POLLING ----------------

  function startPolling(code: string) {
    clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      const { data: r } = await supabase
        .from("duel_rooms")
        .select("*")
        .eq("code", code)
        .single()

      if (!r) return

      setRoom(r)

      const { data: p } = await supabase
        .from("duel_players")
        .select("*")
        .eq("room_code", code)

      setPlayers(p || [])

      // Auto start
      if (r.status === "waiting" && p && p.length === 2) {
        await supabase
          .from("duel_rooms")
          .update({ status: "playing" })
          .eq("code", code)

        startTimer()
      }

      // Poll submissions
      if (r.status === "playing" && !roundClosed) {
        const { data: subs } = await supabase
          .from("duel_submissions")
          .select("*")
          .eq("room_code", code)
          .eq("q_index", currentQIndex)

        if (subs && subs.length >= 2) {
          closeRound(subs)
        }
      }
    }, 1000)
  }

  // ---------------- TIMER ----------------

  function startTimer() {
    setTimer(10)
    setRoundClosed(false)

    clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // ---------------- SUBMIT ----------------

  async function submitGuess() {
    if (!room || !mySlot || !guess || roundClosed) return

    const responseTime = 10 - timer

    await supabase.from("duel_submissions").insert({
      room_code: room.code,
      q_index: currentQIndex,
      slot: mySlot,
      guess: parseInt(guess),
      response_time: responseTime
    })

    setGuess("")
  }

  // ---------------- CLOSE ROUND ----------------

  async function closeRound(submissions: any[]) {
    if (roundClosed) return
    setRoundClosed(true)

    clearInterval(timerRef.current)

    const subA = submissions.find(s => s.slot === "A")
    const subB = submissions.find(s => s.slot === "B")

    const guessA = subA?.guess ?? null
    const guessB = subB?.guess ?? null

    const timeA = subA?.response_time ?? null
    const timeB = subB?.response_time ?? null

    let winner: "A" | "B" | "draw" = "draw"

    if (guessA !== null && guessB === null) winner = "A"
    if (guessB !== null && guessA === null) winner = "B"

    if (guessA !== null && guessB !== null) {
      const distA = Math.abs(guessA - correctAnswer)
      const distB = Math.abs(guessB - correctAnswer)

      if (distA < distB) winner = "A"
      else if (distB < distA) winner = "B"
      else {
        if (timeA < timeB) winner = "A"
        else if (timeB < timeA) winner = "B"
        else winner = "draw"
      }
    }

    if (winner === "A") setScoreA(prev => prev + 1)
    if (winner === "B") setScoreB(prev => prev + 1)

    await supabase.from("duel_round_results").insert({
      room_code: room.code,
      q_index: currentQIndex,
      winner
    })

    // Finish after 3 rounds
    if (scoreA + scoreB >= 2) {
      await supabase
        .from("duel_rooms")
        .update({ status: "finished" })
        .eq("code", room.code)
    }
  }

  // ---------------- UI ----------------

  return (
    <div style={{ padding: 40, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Duel</h1>

      {!room && (
        <>
          <button onClick={createRoom}>Create Room</button>
          <br /><br />
          <input
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase())}
          />
          <button onClick={joinRoom}>Join</button>
        </>
      )}

      {room && (
        <>
          <p>Room: {room.code}</p>
          <p>Status: {room.status}</p>
          <p>Score A: {scoreA} | Score B: {scoreB}</p>

          {room.status === "playing" && (
            <>
              <p>Time left: {timer}</p>
              {timer === 0 && <p>Time is up</p>}

              <p>Guess the number closest to 100</p>

              <input
                value={guess}
                onChange={e => setGuess(e.target.value)}
                disabled={roundClosed}
              />

              <button
                onClick={submitGuess}
                disabled={roundClosed}
              >
                Submit
              </button>
            </>
          )}

          {room.status === "finished" && (
            <>
              <h2>Duel Finished</h2>
              {scoreA > scoreB && <p>Player A wins</p>}
              {scoreB > scoreA && <p>Player B wins</p>}
              {scoreA === scoreB && <p>Draw</p>}
            </>
          )}
        </>
      )}
    </div>
  )
}
