export function OrbitMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden>
      <circle cx="22" cy="22" r="20" stroke="var(--border-strong)" />
      <circle cx="22" cy="22" r="12" stroke="var(--border-strong)" strokeDasharray="3 4" />
      <circle cx="22" cy="22" r="4.5" fill="var(--teal)" style={{ filter: "drop-shadow(0 0 8px var(--teal))" }} />
      <circle cx="36.5" cy="14" r="3" fill="var(--violet)" style={{ filter: "drop-shadow(0 0 6px var(--violet))" }} />
      <circle cx="12" cy="31" r="2.4" fill="var(--magenta)" style={{ filter: "drop-shadow(0 0 6px var(--magenta))" }} />
    </svg>
  );
}
