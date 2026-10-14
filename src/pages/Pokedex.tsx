import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { TypeBadge } from "../components/TypeBadge";
import { ALL_TYPES, useGameData, type GameData, type PokemonType, type Species } from "../lib/go/gamedata";
import { calcCP, calcHP } from "../lib/go/stats";

type SortKey = "dex" | "name" | "atk" | "def" | "sta" | "maxcp";

const PERFECT = { atk: 15, def: 15, sta: 15 };
const maxCP50 = (s: Species) => calcCP(s, PERFECT, 50);

const TAG_LABELS: Record<string, string> = {
  legendary: "Legendary",
  mythical: "Mythical",
  ultrabeast: "Ultra Beast",
  regional: "Regional",
};

export default function Pokedex() {
  const { data, error } = useGameData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<PokemonType | null>(null);
  const [showMegas, setShowMegas] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "dex", desc: false });
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedId = params.get("p");

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = data.species.filter(
      (s) =>
        (showMegas || !s.mega) &&
        (!type || s.types.includes(type)) &&
        (!q || s.name.toLowerCase().includes(q) || String(s.dex) === q.replace(/^#/, "")),
    );
    const val = (s: Species) =>
      sort.key === "maxcp" ? maxCP50(s) : sort.key === "name" ? s.name : s[sort.key];
    return filtered.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return (sort.desc ? -cmp : cmp) || a.dex - b.dex;
    });
  }, [data, query, type, showMegas, sort]);

  const selected = selectedId && data ? data.byId.get(selectedId) ?? null : null;
  const select = (id: string | null) =>
    setParams((p) => {
      if (id) p.set("p", id);
      else p.delete("p");
      return p;
    }, { replace: true });

  // Keyboard: "/" jumps to search, arrow keys move through the list, Escape closes details.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        select(null);
        searchRef.current?.blur();
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && rows.length) {
        e.preventDefault();
        const i = rows.findIndex((r) => r.id === selectedId);
        const next = e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
        select(rows[i === -1 ? 0 : next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (selectedId) document.getElementById(`dex-${selectedId}`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const header = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <th className={`px-3 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        className={`inline-flex items-center gap-1 hover:text-ink-100 ${sort.key === key ? "text-glow-300" : ""}`}
        onClick={() =>
          setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "dex" && key !== "name" }))
        }
      >
        {label}
        {sort.key === key && <span aria-hidden="true">{sort.desc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Pokédex"
        subtitle={
          data
            ? `${rows.length.toLocaleString()} of ${data.species.filter((s) => showMegas || !s.mega).length.toLocaleString()} Pokémon, with Pokémon GO stats`
            : "Pokémon GO stats, moves and evolutions"
        }
        actions={
          <div className="relative w-72">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or number"
              className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 pr-8 text-sm placeholder:text-ink-400 focus:border-glow-500 focus:outline-none"
            />
            <kbd className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-ink-700 px-1.5 text-[11px] text-ink-400">
              /
            </kbd>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-800 px-8 py-3">
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType((cur) => (cur === t ? null : t))}
            className={`rounded transition ${type && type !== t ? "opacity-35 hover:opacity-80" : ""} ${
              type === t ? "ring-2 ring-glow-400/70" : ""
            }`}
            aria-pressed={type === t}
          >
            <TypeBadge type={t} />
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={showMegas}
            onChange={(e) => setShowMegas(e.target.checked)}
            className="accent-glow-500"
          />
          Show Mega and Primal forms
        </label>
      </div>

      {error && <p className="px-8 py-6 text-rose-300">{error}. Refresh the page to try again.</p>}
      {!data && !error && <p className="px-8 py-6 text-sm text-ink-400">Loading Pokédex…</p>}

      {data && (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-ink-950 text-xs text-ink-400">
                <tr className="border-b border-ink-800">
                  {header("dex", "#", "left")}
                  {header("name", "Name", "left")}
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  {header("atk", "Attack")}
                  {header("def", "Defense")}
                  {header("sta", "Stamina")}
                  {header("maxcp", "Max CP")}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    id={`dex-${s.id}`}
                    onClick={() => select(s.id === selectedId ? null : s.id)}
                    className={`cursor-pointer border-b border-ink-850 ${
                      s.id === selectedId ? "bg-glow-500/12" : "hover:bg-ink-900"
                    }`}
                  >
                    <td className="px-3 py-2 font-display text-ink-400 tabular-nums">
                      {String(s.dex).padStart(4, "0")}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-semibold ${s.id === selectedId ? "text-glow-300" : ""}`}>{s.name}</span>
                      {s.tags?.filter((t) => TAG_LABELS[t]).map((t) => (
                        <span key={t} className="ml-2 text-[11px] text-ink-400">
                          {TAG_LABELS[t]}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex gap-1">
                        {s.types.map((t) => (
                          <TypeBadge key={t} type={t} />
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.atk}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.def}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.sta}</td>
                    <td className="px-3 py-2 text-right font-display font-semibold tabular-nums">
                      {maxCP50(s).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="px-8 py-10 text-sm text-ink-400">
                No Pokémon match that search. Try a shorter name or clear the type filter.
              </p>
            )}
            <p className="px-8 py-6 text-xs text-ink-400">
              Game data from PvPoke, updated {data.sourceUpdated?.slice(0, 10) ?? "recently"}. Max CP is a
              perfect-IV Pokémon at level 50.
            </p>
          </div>

          {selected && <Details species={selected} data={data} onSelect={select} />}
        </div>
      )}
    </div>
  );
}

function familyChain(s: Species, data: GameData): Species[][] {
  // Walk up to the first stage, then lay out each stage of the family.
  let root = s;
  while (root.parent && data.byId.get(root.parent)) root = data.byId.get(root.parent)!;
  const stages: Species[][] = [];
  let current = [root];
  while (current.length && stages.length < 4) {
    stages.push(current);
    current = current.flatMap((c) => (c.evolutions ?? []).map((id) => data.byId.get(id)).filter((x): x is Species => !!x));
  }
  return stages;
}

function Details({
  species: s,
  data,
  onSelect,
}: {
  species: Species;
  data: GameData;
  onSelect: (id: string | null) => void;
}) {
  const chain = familyChain(s, data);
  const statMax = 420;

  return (
    <aside className="w-[380px] shrink-0 overflow-y-auto border-l border-ink-800 bg-ink-900/60 px-6 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm text-ink-400">#{String(s.dex).padStart(4, "0")}</p>
          <h2 className="font-display text-2xl font-bold">{s.name}</h2>
          <div className="mt-2 flex gap-1.5">
            {s.types.map((t) => (
              <TypeBadge key={t} type={t} size="md" />
            ))}
          </div>
        </div>
        <button
          onClick={() => onSelect(null)}
          className="rounded-md px-2 py-1 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          aria-label="Close details"
        >
          Esc
        </button>
      </div>

      <section className="mt-6 space-y-2">
        {([
          ["Attack", s.atk],
          ["Defense", s.def],
          ["Stamina", s.sta],
        ] as const).map(([label, v]) => (
          <div key={label} className="grid grid-cols-[64px_1fr_36px] items-center gap-3 text-sm">
            <span className="text-ink-300">{label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-ink-800">
              <span
                className="block h-full rounded-full bg-linear-to-r from-glow-400 to-ice-400"
                style={{ width: `${Math.min(100, (v / statMax) * 100)}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{v}</span>
          </div>
        ))}
      </section>

      <section className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[40, 50, 51].map((lvl) => (
          <div key={lvl} className="rounded-lg border border-ink-800 bg-ink-950/60 px-2 py-2.5">
            <p className="font-display text-lg font-bold tabular-nums">{calcCP(s, PERFECT, lvl).toLocaleString()}</p>
            <p className="text-[11px] text-ink-400">
              Max CP, level {lvl}
              <br />
              {calcHP(s, PERFECT, lvl)} HP
            </p>
          </div>
        ))}
      </section>

      {chain.length > 1 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-ink-300">Evolution family</h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            {chain.map((stage, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-ink-600">›</span>}
                {stage.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onSelect(m.id)}
                    className={`rounded-md border px-2 py-1 ${
                      m.id === s.id
                        ? "border-glow-500/60 bg-glow-500/12 text-glow-300"
                        : "border-ink-700 hover:border-ink-600 hover:bg-ink-800"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </span>
            ))}
          </div>
        </section>
      )}

      <MoveList title="Fast moves" ids={s.fast} species={s} data={data} />
      <MoveList title="Charged moves" ids={s.charged} species={s} data={data} />

      <section className="mt-6 space-y-1.5 text-sm text-ink-300">
        {s.shadow && <p>Can be caught as a Shadow Pokémon.</p>}
        {s.buddyKm && <p>Buddy distance: {s.buddyKm} km per candy.</p>}
        {s.thirdMoveDust && <p>Second charged move: {s.thirdMoveDust.toLocaleString()} stardust plus candy.</p>}
      </section>
    </aside>
  );
}

function MoveList({ title, ids, species, data }: { title: string; ids: string[]; species: Species; data: GameData }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-ink-300">{title}</h3>
      <ul className="mt-2 space-y-1">
        {ids.map((id) => {
          const m = data.moves[id];
          if (!m) return null;
          const elite = species.elite?.includes(id);
          const legacy = species.legacy?.includes(id);
          const p = m.pvp;
          return (
            <li key={id} className="flex items-center gap-2 rounded-md bg-ink-950/50 px-2.5 py-1.5 text-sm">
              <TypeBadge type={m.type} />
              <span className="flex-1 font-medium">{m.name}</span>
              {(elite || legacy) && (
                <span className="text-[11px] font-semibold text-ice-400">{elite ? "Elite TM" : "Legacy"}</span>
              )}
              <span className="font-display text-xs text-ink-400 tabular-nums" title="Battle League stats">
                {p.energyGain !== undefined ? `${p.power} / +${p.energyGain} / ${p.turns}t` : `${p.power} / ${p.energy}e`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
