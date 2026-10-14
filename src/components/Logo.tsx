export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14" : "h-9 w-9";
  const text = size === "lg" ? "text-2xl" : "text-lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <img
        src="/logo-128.png"
        alt=""
        className={`${box} drop-shadow-[0_0_10px_rgba(82,216,178,0.25)]`}
        width={128}
        height={128}
      />
      <span className={`${text} font-extrabold tracking-tight`}>Shinboku</span>
    </span>
  );
}
