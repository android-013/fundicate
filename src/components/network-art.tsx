export function NetworkArt({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`protocol-art ${compact ? "compact" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 580 380" fill="none">
        <defs>
          <linearGradient id="protocol-path" x1="60" y1="280" x2="510" y2="70">
            <stop stopColor="#38d9e6" />
            <stop offset="1" stopColor="#a78bfa" />
          </linearGradient>
          <radialGradient id="protocol-glow">
            <stop stopColor="#7775ff" stopOpacity=".22" />
            <stop offset="1" stopColor="#7775ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="290" cy="190" r="190" fill="url(#protocol-glow)" />
        <path
          d="M70 250L185 90L310 170L465 75L510 265L365 310L310 170L185 90L160 305L365 310L465 75M70 250L310 170L510 265M160 305L310 170"
          stroke="url(#protocol-path)"
          strokeOpacity=".35"
        />
        <path
          d="M70 250L185 90L310 170L465 75M310 170L365 310L510 265"
          stroke="url(#protocol-path)"
          strokeWidth="2"
          strokeDasharray="5 12"
          className="flow-line"
        />
        {[
          { x: 70, y: 250, r: 9 },
          { x: 185, y: 90, r: 18 },
          { x: 310, y: 170, r: 35 },
          { x: 465, y: 75, r: 13 },
          { x: 510, y: 265, r: 20 },
          { x: 365, y: 310, r: 15 },
          { x: 160, y: 305, r: 11 },
        ].map((n, i) => (
          <g key={i}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r + 12}
              fill="#111728"
              stroke="#8c91ff"
              strokeOpacity=".18"
            />
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={i === 2 ? "#7775ff" : "#131f35"}
              stroke={i % 2 ? "#b6a4ff" : "#5adce5"}
              strokeWidth="1.5"
            />
            {i === 2 ? (
              <path
                d="m294 170 11 11 22-24"
                stroke="white"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </g>
        ))}
        <text x="145" y="49" fill="#c6ceea" fontSize="10" letterSpacing="2">
          PEOPLE
        </text>
        <text x="337" y="154" fill="#e4e8ff" fontSize="10" letterSpacing="2">
          CONSENSUS
        </text>
        <text x="447" y="313" fill="#c6ceea" fontSize="10" letterSpacing="2">
          SHARED GROWTH
        </text>
      </svg>
      <span className="protocol-caption">
        <i /> CONNECT. DECIDE. BUILD.
      </span>
    </div>
  );
}
export function BrandMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="27"
      height="27"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 10 23 7 24 23 8 10 8 25 24 23"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect x="3" y="5" width="10" height="10" rx="3" fill="#aaa2ff" />
      <rect x="19" y="2" width="10" height="10" rx="3" fill="#6de3eb" />
      <rect x="19" y="19" width="10" height="10" rx="3" fill="#9d8eff" />
      <rect x="3" y="20" width="10" height="10" rx="3" fill="#6de3eb" />
    </svg>
  );
}
