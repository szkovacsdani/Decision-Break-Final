"use client";

import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase";

export default function Home() {
  useEffect(() => {
    console.log("SUPABASE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  }, []);

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
      <div style={{ maxWidth: 760, width: "100%" }}>
        <h1 style={{ fontSize: 56, margin: 0, letterSpacing: 1 }}>
          Decision Break
        </h1>

        <p style={{ fontSize: 24, marginTop: 16, opacity: 0.9 }}>
          Think fast. Or lose ground.
        </p>

        {/* BUTTONS */}
        <div
          style={{
            marginTop: 28,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {/* PLAY QUIZ */}
          <a
            href="/quiz"
            style={{
              display: "inline-block",
              backgroundColor: "#1f8f3a",
              color: "#ffffff",
              padding: "14px 22px",
              borderRadius: "10px",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            PLAY QUIZ
          </a>

          {/* PLAY DUEL */}
          <a
            href="/duel-v2"
            style={{
              display: "inline-block",
              backgroundColor: "#b30000",
              color: "#ffffff",
              padding: "14px 22px",
              borderRadius: "10px",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            PLAY DUEL
          </a>
        </div>

        {/* INFO GRID */}
        <div
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              padding: 12,
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 900 }}>2–8</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Players</div>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              padding: 12,
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 900 }}>14+</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Age</div>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              padding: 12,
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 900 }}>60–120</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Minutes</div>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              padding: 12,
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 900 }}>Hybrid</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Physical + Digital</div>
          </div>
        </div>
      </div>
    </main>
  );
}
