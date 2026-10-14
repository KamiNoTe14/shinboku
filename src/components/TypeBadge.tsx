import type { PokemonType } from "../lib/go/gamedata";

// Type colors tuned to read on Shinboku's dark navy, not copied from the games.
const colors: Record<PokemonType, string> = {
  Normal: "#a8a29e",
  Fire: "#fb923c",
  Water: "#60a5fa",
  Grass: "#4ade80",
  Electric: "#facc15",
  Ice: "#67e8f9",
  Fighting: "#f87171",
  Poison: "#c084fc",
  Ground: "#d6a35c",
  Flying: "#a5b4fc",
  Psychic: "#f472b6",
  Bug: "#a3e635",
  Rock: "#c8b273",
  Ghost: "#8b7fd6",
  Dragon: "#818cf8",
  Dark: "#8b8fa3",
  Steel: "#94b4c8",
  Fairy: "#f9a8d4",
};

export function TypeBadge({ type, size = "sm" }: { type: PokemonType; size?: "sm" | "md" }) {
  const c = colors[type];
  return (
    <span
      className={`inline-flex items-center rounded font-semibold ${
        size === "md" ? "px-2 py-0.5 text-xs" : "px-1.5 py-px text-[11px]"
      }`}
      style={{ color: c, backgroundColor: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}40` }}
    >
      {type}
    </span>
  );
}
