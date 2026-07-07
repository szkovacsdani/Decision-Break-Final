export default function RulebookPage() {
    return (
      <main
        style={{
          minHeight: "100vh",
          backgroundImage: "url('/images/hero-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "40px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            background: "rgba(20,20,20,.65)",
            padding: "50px",
            borderRadius: "18px",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,.08)",
          }}
        >
          <h1
            style={{
              color: "#fff",
              fontSize: "56px",
              marginBottom: "10px",
            }}
          >
            Official Rulebook
          </h1>
  
          <p
            style={{
              color: "#ccc",
              marginBottom: "30px",
            }}
          >
            Download the latest official Decision Break rulebook.
          </p>
  
          <a
            href="/documents/rulebook.docx"
            download
            style={{
              display: "inline-block",
              marginTop: 20,
              background: "#1c8d37",
              color: "#fff",
              padding: "16px 30px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 800,
              boxShadow: "0 0 25px rgba(0,255,80,.35)",
            }}
          >
            📥 DOWNLOAD OFFICIAL RULEBOOK
          </a>
  
          <br />
  
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: "30px",
              color: "#fff",
              opacity: 0.8,
              textDecoration: "none",
            }}
          >
            ← Main Menu
          </a>
        </div>
      </main>
    );
  }