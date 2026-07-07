export default function LightningBackground() {
    return (
      <>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.6,
          }}
        >
          {/* BLUE */}
          <path
            d="M12 0 L20 18 L15 26 L28 42 L22 56 L34 72 L28 100"
            stroke="#3aa8ff"
            strokeWidth="0.4"
            fill="none"
            strokeLinecap="round"
            className="blueBolt"
          />
  
          {/* RED */}
          <path
            d="
  M88 0
  L84 10
  L87 18
  L77 30
  L81 42
  L70 55
  L74 67
  L63 81
  L68 100
  
  M74 67
  L82 72
  L79 80
  
  M81 42
  L73 46
  L76 55
  "
            stroke="#ff4040"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
            className="redBolt"
          />
        </svg>
      </>
    );
  }
  