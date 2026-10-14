// Turns a selection of Pokémon into Pokémon GO search strings.
//
// GO's search bar ANDs groups separated by "&" and ORs terms separated by ",".
// So the narrowest single string for a mixed selection is
//   <dex numbers> & <CPs> [& <HPs>] [& shiny/lucky/shadow/purified]
// which can also catch other Pokémon that happen to share a species and a CP.
// Because Shinboku knows the whole bag, it checks exactly what each string will
// match, adds HP when that removes extras, and reports anything left over.

export type Searchable = {
  id: string;
  dex: number;
  cp: number;
  hp?: number;
  shiny?: boolean;
  lucky?: boolean;
  variant?: "shadow" | "purified";
};

export type SearchResult = {
  query: string;
  count: number; // selected Pokémon this string finds
  extras: number; // other Pokémon in the bag it would also find
};

/** Keep strings comfortably short for the in-game search bar. */
export const MAX_PER_SEARCH = 40;

type Query = {
  dex: Set<number>;
  cp: Set<number>;
  hp: Set<number> | null;
  flags: { shiny?: boolean; lucky?: boolean; variant?: "shadow" | "purified" };
};

function matches(q: Query, p: Searchable): boolean {
  if (!q.dex.has(p.dex) || !q.cp.has(p.cp)) return false;
  if (q.hp && (p.hp === undefined || !q.hp.has(p.hp))) return false;
  if (q.flags.shiny && !p.shiny) return false;
  if (q.flags.lucky && !p.lucky) return false;
  if (q.flags.variant && p.variant !== q.flags.variant) return false;
  return true;
}

const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

function render(q: Query): string {
  const parts = [sorted(q.dex).join(","), sorted(q.cp).map((c) => `cp${c}`).join(",")];
  if (q.hp) parts.push(sorted(q.hp).map((h) => `hp${h}`).join(","));
  if (q.flags.shiny) parts.push("shiny");
  if (q.flags.lucky) parts.push("lucky");
  if (q.flags.variant) parts.push(q.flags.variant);
  return parts.join("&");
}

function buildOne(selected: Searchable[], bag: Searchable[]): SearchResult {
  const ids = new Set(selected.map((p) => p.id));
  const q: Query = {
    dex: new Set(selected.map((p) => p.dex)),
    cp: new Set(selected.map((p) => p.cp)),
    hp: null,
    flags: {
      shiny: selected.every((p) => p.shiny) || undefined,
      lucky: selected.every((p) => p.lucky) || undefined,
      variant: selected.every((p) => p.variant === selected[0].variant) ? selected[0].variant : undefined,
    },
  };
  const extras = () => bag.filter((p) => !ids.has(p.id) && matches(q, p)).length;

  let extra = extras();
  // Add HP only when it helps and every selected Pokémon has one recorded.
  if (extra > 0 && selected.every((p) => p.hp !== undefined)) {
    q.hp = new Set(selected.map((p) => p.hp!));
    const withHp = extras();
    if (withHp < extra) extra = withHp;
    else q.hp = null;
  }
  return { query: render(q), count: selected.length, extras: extra };
}

/**
 * Search strings for a selection, split into chunks for large selections.
 * Chunks group Pokémon of the same species together, which keeps each string
 * short and precise.
 */
export function buildSearches(selected: Searchable[], bag: Searchable[]): SearchResult[] {
  if (selected.length === 0) return [];
  const bySpecies = [...selected].sort((a, b) => a.dex - b.dex || a.cp - b.cp);
  const chunks: Searchable[][] = [];
  for (let i = 0; i < bySpecies.length; i += MAX_PER_SEARCH) chunks.push(bySpecies.slice(i, i + MAX_PER_SEARCH));
  return chunks.map((c) => buildOne(c, bag));
}
