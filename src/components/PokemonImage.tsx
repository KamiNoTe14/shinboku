import { useState } from "react";
import type { Species } from "../lib/go/gamedata";

// Images are linked from PokeAPI's public sprite collection rather than hosted by
// Shinboku. Pokémon images are © Nintendo, Creatures Inc. and GAME FREAK inc.
const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

export type ImageStyle =
  | "pixel" // compact list icons
  | "home" // 3D renders, closest to how Pokémon look in GO
  | "art"; // official artwork

function urlFor(style: ImageStyle, id: number, shiny: boolean) {
  const shinyPath = shiny ? "shiny/" : "";
  switch (style) {
    case "pixel":
      return `${BASE}/${shinyPath}${id}.png`;
    case "home":
      return `${BASE}/other/home/${shinyPath}${id}.png`;
    case "art":
      return `${BASE}/other/official-artwork/${shinyPath}${id}.png`;
  }
}

export function PokemonImage({
  species,
  style,
  size,
  shiny = false,
  silhouette = false,
  className = "",
  eager = false,
}: {
  species: Pick<Species, "dex" | "img" | "name">;
  style: ImageStyle;
  size: number;
  shiny?: boolean;
  silhouette?: boolean;
  className?: string;
  eager?: boolean;
}) {
  // Try the exact form first, then the base species; for shinies, fall back to the
  // regular colors before giving up and showing a placeholder.
  const ids = [species.img, species.dex].filter((x): x is number => typeof x === "number");
  const candidates = [...(shiny ? ids.map((id) => ({ id, shiny: true })) : []), ...ids.map((id) => ({ id, shiny: false }))];
  const [attempt, setAttempt] = useState(0);
  const current = candidates[attempt];

  if (!current) {
    return (
      <span
        className={`inline-block rounded-full bg-ink-800 ${className}`}
        style={{ width: size * 0.6, height: size * 0.6, margin: size * 0.2 }}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      key={`${style}-${current.id}-${current.shiny}`}
      src={urlFor(style, current.id, current.shiny)}
      alt={silhouette ? "Unknown Pokémon silhouette" : species.name}
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => setAttempt((a) => a + 1)}
      className={`select-none object-contain ${style === "pixel" ? "[image-rendering:pixelated]" : ""} ${
        silhouette ? "silhouette" : ""
      } ${className}`}
      // Pixel sprites sit inside lots of empty canvas; scale them up to fill list rows.
      style={{ width: size, height: size, transform: style === "pixel" ? "scale(1.4)" : undefined }}
    />
  );
}
