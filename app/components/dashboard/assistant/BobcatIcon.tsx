/**
 * An original, generic bobcat face in QU navy and gold — a placeholder, not the
 * official Quinnipiac mascot or logo (marketing will supply that). Decorative:
 * the button around it carries the label.
 */
export default function BobcatIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {/* Ears with tufts */}
      <path d="M13 26 L15 6 L19 4 L27 18 Z" fill="#FFB81C" />
      <path d="M51 26 L49 6 L45 4 L37 18 Z" fill="#FFB81C" />
      <path d="M17 9 L18 3 M47 9 L46 3" stroke="#FFB81C" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 12 L23 19 L16 22 Z M47 12 L41 19 L48 22 Z" fill="#0C2340" />
      {/* Head with cheek ruffs */}
      <path
        d="M32 15 C44 15 52 23 52 33 C52 37 55 40 58 41 C54 43 52 46 50 47 C46 54 39 58 32 58 C25 58 18 54 14 47 C12 46 10 43 6 41 C9 40 12 37 12 33 C12 23 20 15 32 15 Z"
        fill="#FFB81C"
      />
      {/* Muzzle */}
      <ellipse cx="32" cy="45" rx="10" ry="7.5" fill="#FFF4D6" />
      {/* Eyes */}
      <path d="M20 32 Q24 28 28 32 Q24 35 20 32 Z M36 32 Q40 28 44 32 Q40 35 36 32 Z" fill="#0C2340" />
      <circle cx="24.5" cy="31.6" r="1" fill="#FFF4D6" />
      <circle cx="40.5" cy="31.6" r="1" fill="#FFF4D6" />
      {/* Forehead stripes */}
      <path d="M29 19 L30 24 M32 18 L32 24 M35 19 L34 24" stroke="#0C2340" strokeWidth="1.6" strokeLinecap="round" />
      {/* Nose and mouth */}
      <path d="M29 41 L35 41 L32 44.5 Z" fill="#0C2340" />
      <path d="M32 44.5 L32 47 M32 47 Q29 49.5 27 47.5 M32 47 Q35 49.5 37 47.5" stroke="#0C2340" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* Whiskers */}
      <path d="M22 45 L13 43 M22 47.5 L13 48.5 M42 45 L51 43 M42 47.5 L51 48.5" stroke="#0C2340" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
