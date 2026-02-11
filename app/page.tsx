export default function Home() {
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
      <div style={{ maxWidth: 760, width: "100%" }}>
        <h1 style={{ fontSize: 56, margin: 0, letterSpacing: 1 }}>Decision Break</h1>

        <p style={{ fontSize: 24, marginTop: 16, opacity: 0.9 }}>Think fast. Or lose ground.</p>

        <div style={{ marginTop: 28 }}>
          <a
            href="/quiz"
            style={{
              display: "inline-block",
              background: "#C1121F",
              color: "#fff",
              padding: "14px 22px",
              borderRadius: 10,
              fontWeight: 900,
              textDecoration: "none"
            }}
          >
            PLAY QUIZ
          </a>
        </div>

        <div
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12
          }}
        >
          <div style={{ background: "rgba(255,255,255,0.06)", padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 900 }}>2–8</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Players</div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.06)", padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 900 }}>14+</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Age</div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.06)", padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 900 }}>60–120</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Minutes</div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.06)", padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 900 }}>Hybrid</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Physical + Digital</div>
          </div>
        </div>
      </div>
    </main>
  );
}
