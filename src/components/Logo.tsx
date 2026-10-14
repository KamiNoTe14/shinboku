export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11" : "h-8 w-8";
  const text = size === "lg" ? "text-2xl" : "text-lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className={box} aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#1e305e" />
        <path d="M32 12 C22 22 22 34 32 52 C42 34 42 22 32 12 Z" fill="#7dd3a8" />
        <path d="M32 18 V48" stroke="#1e305e" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className={`${text} font-extrabold tracking-tight`}>Shinboku</span>
    </span>
  );
}
