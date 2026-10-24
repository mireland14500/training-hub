/** A runner on a track with a heartbeat pulse above — pure SVG + CSS. */
export default function Runner({ done }: { done: boolean }) {
  const ecg = "4,26 78,26 88,26 96,8 106,46 114,18 120,26 236,26";
  return (
    <svg viewBox="0 0 240 150" className={`sync-runner mx-auto h-auto w-56 ${done ? "is-done" : ""}`} role="img" aria-label="Animated runner">
      <polyline points={ecg} fill="none" stroke="var(--border)" strokeWidth="2" strokeLinejoin="round" />
      <polyline className="sync-ecg" points={ecg} pathLength={100} fill="none" stroke="var(--bad)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <line x1="10" y1="136" x2="230" y2="136" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" />
      <line className="sync-dash" x1="-40" y1="144" x2="280" y2="144" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 24" />
      <g className="sync-wind" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5">
        <line x1="62" y1="70" x2="84" y2="70" />
        <line x1="52" y1="86" x2="80" y2="86" />
        <line x1="66" y1="102" x2="84" y2="102" />
      </g>
      <g className="sync-body" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* far-side limbs first, lighter */}
        <g className="sync-limb sync-b" style={{ transformOrigin: "120px 98px" }} opacity="0.5">
          <polyline points="120,98 132,114 126,132" />
        </g>
        <g className="sync-limb sync-a" style={{ transformOrigin: "128px 66px" }} opacity="0.5">
          <polyline points="128,66 140,80 152,72" />
        </g>
        <line x1="129" y1="64" x2="120" y2="98" />
        <circle cx="134" cy="48" r="10" fill="var(--accent)" stroke="none" />
        <g className="sync-limb sync-a" style={{ transformOrigin: "120px 98px" }}>
          <polyline points="120,98 132,114 126,132" />
        </g>
        <g className="sync-limb sync-b" style={{ transformOrigin: "128px 66px" }}>
          <polyline points="128,66 140,80 152,72" />
        </g>
      </g>
    </svg>
  );
}
