"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    console.log("SUPABASE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundImage: "url('/images/hero-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "50% center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        padding: "20px",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          width: "100%",
          padding: "0 8px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(42px, 8vw, 72px)",
            lineHeight: 1.05,
            fontWeight: 900,
            color: "#fff",
            margin: 0,
            letterSpacing: 1,
            textShadow: "0 0 18px rgba(255,255,255,.18)",
          }}
        >
          Decision Break
        </h1>

        <p
          style={{
            marginTop: 18,
            fontSize: "clamp(18px, 4vw, 26px)",
            padding: "0 12px",
            lineHeight: 1.5,
            color: "#ddd",
          }}
        >
          Think fast. Or lose ground.
        </p>

        {/* BUTTONS */}

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 18,
            marginTop: 40,
            flexWrap: "wrap",
          }}
        >
          <a
            href="/quiz"
            style={{
              background: "#1c8d37",
              color: "#fff",
              textDecoration: "none",
              borderRadius: 12,
              fontWeight: 800,
              padding: "18px 32px",
              fontSize: 18,
              minWidth: 220,
              width: "100%",
              maxWidth: 280,
              textAlign: "center",
              boxShadow:
                "0 0 10px rgba(0,255,80,.45), 0 0 25px rgba(0,255,80,.35), 0 0 45px rgba(0,255,80,.25)",
              transition: "0.25s",
            }}
          >
            PLAY QUIZ
          </a>

          <a
            href="/duel-v2"
            style={{
              background: "#b30000",
              color: "#fff",
              textDecoration: "none",
              borderRadius: 12,
              fontWeight: 800,
              padding: "18px 32px",
              fontSize: 18,
              minWidth: 220,
              width: "100%",
              maxWidth: 280,
              textAlign: "center",
              boxShadow:
                "0 0 10px rgba(255,0,0,.45), 0 0 25px rgba(255,0,0,.35), 0 0 45px rgba(255,0,0,.25)",
              transition: "0.25s",
            }}
          >
            PLAY DUEL
          </a>
        </div>

        {/* INFO */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 18,
            marginTop: 60,
          }}
        >
                    {[
            ["2–8", "Players"],
            ["14+", "Age"],
            ["60–120", "Minutes"],
            ["Hybrid", "Physical + Digital"],
          ].map(([title, subtitle]) => (
            <div
              key={title}
              style={{
                background: "rgba(20,20,20,.55)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 16,
                padding: "24px 16px",
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "clamp(24px, 5vw, 30px)",
                }}
              >
                {title}
              </div>

              <div
                style={{
                  color: "#cfcfcf",
                  fontSize: 14,
                  marginTop: 8,
                }}
              >
                {subtitle}
              </div>
            </div>
          ))}
        </div>

        <a
  href="/rulebook"
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 32,
    background: "#d4af37",
    color: "#111",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 18,
    padding: "18px 24px",
    borderRadius: 16,
    boxShadow:
      "0 0 12px rgba(255,215,0,.6), 0 0 28px rgba(255,200,0,.35)",
  }}
>
  📖 OFFICIAL RULEBOOK →
</a>

      </div>
    </main>
  );
}