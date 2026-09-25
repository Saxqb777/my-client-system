export function OrbitMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden className={className}>
      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1" />
      <circle cx="20" cy="20" r="10.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="2 3" />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
      <circle cx="33" cy="12" r="2.4" fill="var(--signal)" />
    </svg>
  );
}
