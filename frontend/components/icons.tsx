export function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}

export function SkullIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path d="M12 2C7 2 4 5.5 4 10c0 2.5 1.2 4.3 2.5 5.5V19a1 1 0 001 1h1.2v-2h1v2h4.6v-2h1v2H16a1 1 0 001-1v-3.5C18.8 14.3 20 12.5 20 10c0-4.5-3-8-8-8z" />
      <circle cx="9.2" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Werewolf: pointed ears + snout, minimal enough to read at avatar size. */
export function WolfIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
    >
      <path d="M4 9.5L6 3l3.7 3.6h4.6L18 3l2 6.5-1.8 7.8-3-2-2.2 2-2.2-2-3 2z" />
      <path d="M12 12.6l-1.5 2.4h3z" fill="currentColor" stroke="none" />
      <circle cx="9" cy="10.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Doctor: a medical cross, no other role reads as clearly at this size. */
export function DoctorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M12 8.2v7.6M8.2 12h7.6" strokeLinecap="round" />
    </svg>
  );
}

/** Plain villager: a generic figure, the default for anyone not seer/doctor/werewolf. */
export function VillagerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <circle cx="12" cy="7.6" r="3.3" />
      <path d="M5 20c0-4.2 3.1-6.8 7-6.8s7 2.6 7 6.8" strokeLinecap="round" />
    </svg>
  );
}
