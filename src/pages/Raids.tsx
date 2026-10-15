import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { Combobox, type Option } from "../components/Combobox";
import { PageHeader } from "../components/PageHeader";
import { PokemonImage } from "../components/PokemonImage";
import { SearchStringPanel, copyText } from "../components/SearchStringPanel";
import { TypeBadge } from "../components/TypeBadge";
import { useBag } from "../lib/bag";
import { toRows, toSearchable } from "../lib/bagRows";
import { useGameData, type GameData, type Species } from "../lib/go/gamedata";
import { weaknesses, type Weather } from "../lib/go/raid";
import { buildSearches, type SearchResult } from "../lib/go/searchString";
import { bagTeam, counters, megaBase, RAID_LEVEL, relativeStrength, TEAM_SIZE, type Counter, type TeamMember } from "../lib/raids";

const WEATHER: { value: Exclude<Weather, null>; label: string }[] = [
  { value: "CLEAR", label: "Sunny / Clear" },
  { value: "PARTLY_CLOUDY", label: "Partly cloudy" },
  { value: "OVERCAST", label: "Cloudy" },
  { value: "RAINY", label: "Rain" },
  { value: "SNOW", label: "Snow" },
  { value: "WINDY", label: "Windy" },
  { value: "FOG", label: "Fog" },
];

const DEFAULT_BOSS = "mewtwo";
const SHOWN = 25;

export default function Raids() {
  const { data, error } = useGameData();
  if (error) return <p className="px-8 py-8 text-rose-300">{error}. Refresh the page to try again.</p>;
  if (!data) return <p className="px-8 py-8 text-sm text-ink-400">Loading game data…</p>;
  return <RaidsLoaded data={data} />;
}

function RaidsLoaded({ data }: { data: GameData }) {
  const { user } = useAuth();
  const bag = useBag();
  const [params, setParams] = useSearchParams();
  const boss = data.byId.get(params.get("boss") ?? "") ?? data.byId.get(DEFAULT_BOSS)!;
  const weather = (WEATHER.find((w) => w.value === params.get("weather"))?.value ?? null) as Weather;
  const [showMegas, setShowMegas] = useState(true);
  const [showShadows, setShowShadows] = useState(true);
  const [searches, setSearches] = useState<SearchResult[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const bossOptions: Option[] = useMemo(
    () =>
      data.species
        .filter((s) => !s.unreleased)
        .map((s) => ({
          value: s.id,
          label: s.name,
          keywords: String(s.dex),
          render: (
            <span className="flex items-center gap-2">
              <PokemonImage species={s} style="pixel" size={28} />
              <span>{s.name}</span>
            </span>
          ),
        })),
    [data],
  );

  const all = useMemo(() => counters(boss, weather, data), [boss, weather, data]);
  const shown = all.filter((c) => (showMegas || !c.sp.mega) && (showShadows || !c.shadow)).slice(0, SHOWN);
  const topScore = all[0]?.perf.score ?? 1;

  const rows = useMemo(() => toRows(bag.pokemon, data), [bag.pokemon, data]);
  const team = useMemo(() => bagTeam(rows, boss, weather, data), [rows, boss, weather, data]);
  const owned = useMemo(() => new Set(rows.map((r) => `${r.species}|${r.variant === "shadow"}`)), [rows]);
  const own = (c: Counter) =>
    c.sp.mega ? owned.has(`${megaBase(c.sp)}|false`) : owned.has(`${c.sp.id}|${c.shadow}`);

  const copyTeam = async () => {
    const results = buildSearches(team.map((m) => toSearchable(m.row)), rows.map(toSearchable));
    if (results.length === 1) {
      const ok = await copyText(results[0].query);
      setNotice(ok ? "Copied. Paste it into the search bar on Pokémon GO's Pokémon screen." : null);
      setSearches(ok ? null : results);
    } else setSearches(results);
  };

  const weak = weaknesses(boss.types, data);

  return (
    <div className="pb-12">
      <PageHeader title="Raid counters" subtitle="The best attackers against any boss, and the best team from your bag" />

      <div className="flex flex-wrap items-end gap-4 border-b border-ink-800 px-8 py-4">
        <label className="w-72">
          <span className="mb-1 block text-xs font-semibold text-ink-400">Raid boss</span>
          <Combobox
            ariaLabel="Raid boss"
            options={bossOptions}
            value={boss.id}
            onChange={(v) => v && set("boss", v)}
            placeholder="Type a name or number"
            maxResults={10}
          />
        </label>
        <label className="w-48">
          <span className="mb-1 block text-xs font-semibold text-ink-400">Weather</span>
          <select
            value={weather ?? ""}
            onChange={(e) => set("weather", e.target.value || null)}
            className="w-full rounded-md border border-ink-700 bg-ink-950 px-2.5 py-2 text-sm focus:border-glow-500 focus:outline-none"
          >
            <option value="">No weather boost</option>
            {WEATHER.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label} ({data.weather[w.value].join(", ")})
              </option>
            ))}
          </select>
        </label>
        <div className="mb-1 flex gap-1">
          <Toggle on={showMegas} onClick={() => setShowMegas((x) => !x)}>
            Megas
          </Toggle>
          <Toggle on={showShadows} onClick={() => setShowShadows((x) => !x)}>
            Shadows
          </Toggle>
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-6 border-b border-ink-800 bg-ink-900/40 px-8 py-5">
        <PokemonImage species={boss} style="home" size={112} eager className="drop-shadow-[0_8px_24px_rgba(82,216,178,0.25)]" />
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold">{boss.name}</h2>
          <div className="mt-1 flex gap-1.5">
            {boss.types.map((t) => (
              <TypeBadge key={t} type={t} size="md" />
            ))}
          </div>
        </div>
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          <dt className="text-xs font-semibold text-ink-400">Weak to</dt>
          <dd className="flex flex-wrap gap-1.5">
            {weak
              .filter((w) => w.mult > 1)
              .map((w) => (
                <span key={w.type} className="inline-flex items-center gap-1">
                  <TypeBadge type={w.type} />
                  <span className="text-xs text-ink-400 tabular-nums">×{w.mult.toFixed(2)}</span>
                </span>
              ))}
          </dd>
          <dt className="text-xs font-semibold text-ink-400">Resists</dt>
          <dd className="flex flex-wrap gap-1.5">
            {weak
              .filter((w) => w.mult < 1)
              .reverse()
              .map((w) => (
                <span key={w.type} className="inline-flex items-center gap-1">
                  <TypeBadge type={w.type} />
                  <span className="text-xs text-ink-400 tabular-nums">×{w.mult.toFixed(2)}</span>
                </span>
              ))}
          </dd>
        </dl>
      </section>

      <div className="grid gap-8 px-8 pt-6 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="min-w-0">
          <h3 className="text-lg font-bold">Best counters</h3>
          <p className="mt-1 text-sm text-ink-400">
            Every Pokémon at level {RAID_LEVEL} with perfect IVs and its best moves. Strength compares damage output with
            the #1 counter, so 90% means about 90% as strong.
          </p>
          <table className="mt-4 w-full table-fixed text-sm">
            <thead className="text-xs text-ink-400">
              <tr className="border-b border-ink-800 text-left">
                <th className="w-10 py-2 font-semibold">#</th>
                <th className="w-12" />
                <th className="py-2 font-semibold">Pokémon</th>
                <th className="py-2 font-semibold">Moves</th>
                <th className="w-16 py-2 text-right font-semibold">DPS</th>
                <th className="w-16 py-2 text-right font-semibold">TDO</th>
                <th className="w-32 py-2 pl-4 font-semibold">Strength</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c, i) => (
                <tr key={`${c.sp.id}-${c.shadow}`} className="border-b border-ink-850">
                  <td className="py-1 font-display font-bold text-ink-400 tabular-nums">{i + 1}</td>
                  <td>
                    <PokemonImage species={c.sp} style="pixel" size={32} />
                  </td>
                  <td className="py-1.5">
                    <span className="font-semibold">{c.sp.name}</span>
                    {c.shadow && <Badge tone="violet">Shadow</Badge>}
                    {c.sp.mega && <Badge tone="amber">{c.sp.id.includes("primal") ? "Primal" : "Mega"}</Badge>}
                    {own(c) && <Badge tone="glow">In your bag</Badge>}
                  </td>
                  <td className="py-1.5 text-ink-300">
                    <MoveName id={c.fast} data={data} elite={isElite(c.sp, c.fast)} />
                    <span className="text-ink-600"> · </span>
                    <MoveName id={c.charged} data={data} elite={isElite(c.sp, c.charged)} />
                  </td>
                  <td className="text-right tabular-nums">{c.perf.dps.toFixed(1)}</td>
                  <td className="text-right text-ink-300 tabular-nums">{Math.round(c.perf.tdo)}</td>
                  <td className="pl-4">
                    <Strength pct={relativeStrength(c.perf.score, topScore)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-400">
            <span className="font-semibold text-amber-200">★</span> needs an Elite TM or was only available during an event.
            Estimates assume a typical boss; real fights also depend on the boss's moves, dodging and your team's levels.
          </p>
        </section>

        <section className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Your best team</h3>
            {team.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => void copyTeam()}
                  className="rounded-md bg-linear-to-r from-glow-400 to-ice-400 px-2.5 py-1 text-sm font-semibold text-ink-950 hover:brightness-110"
                >
                  Copy search string
                </button>
                {searches && (
                  <div className="absolute top-full right-0 w-[380px]">
                    <SearchStringPanel
                      results={searches}
                      onClose={() => setSearches(null)}
                      onCopy={async (q) => setNotice((await copyText(q)) ? "Copied." : null)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          {!user ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              <Link to="/signin" className="text-glow-400 hover:text-glow-300">
                Sign in
              </Link>{" "}
              and add Pokémon to your bag to see the best {TEAM_SIZE} you already have for this raid.
            </p>
          ) : bag.loading ? (
            <p className="mt-2 text-sm text-ink-400">Loading your bag…</p>
          ) : team.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              Your{" "}
              <Link to="/bag" className="text-glow-400 hover:text-glow-300">
                bag
              </Link>{" "}
              is empty. Add Pokémon and Shinboku will pick your best {TEAM_SIZE} for each raid.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-400">
                {notice ?? "At their current levels. Strength is compared with the #1 counter above."}
              </p>
              <ol className="mt-4 space-y-2">
                {team.map((m, i) => (
                  <TeamCard key={m.row.id} m={m} i={i} data={data} pct={relativeStrength(m.perf.score, topScore)} />
                ))}
              </ol>
              {team.some((m) => m.assumedMoves || m.estimatedIv) && (
                <p className="mt-3 text-xs leading-relaxed text-ink-400">
                  Moves marked “assumed” weren't entered, so Shinboku picked the best ones that don't need an Elite TM.
                  Add moves and appraisals in your bag for a more accurate team.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const isElite = (sp: Species, move: string) => !!(sp.elite?.includes(move) || sp.legacy?.includes(move));

function MoveName({ id, data, elite }: { id: string; data: GameData; elite?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      {data.moves[id]?.name ?? id}
      {elite && (
        <span className="ml-0.5 text-amber-200" title="Needs an Elite TM">
          ★
        </span>
      )}
    </span>
  );
}

function TeamCard({ m, i, data, pct }: { m: TeamMember; i: number; data: GameData; pct: number }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2">
      <span className="w-4 font-display font-bold text-ink-400">{i + 1}</span>
      <PokemonImage species={m.row.sp} style="home" size={48} shiny={m.row.shiny} />
      <div className="min-w-0 flex-1">
        <div className="truncate">
          <span className="font-semibold">{m.row.nickname ?? m.row.sp.name}</span>
          {m.row.variant === "shadow" && <Badge tone="violet">Shadow</Badge>}
        </div>
        <div className="truncate text-xs text-ink-400 tabular-nums">
          {m.row.cp.toLocaleString()} CP · level {m.level}
          {m.row.iv ? ` · ${m.row.iv.join("/")}` : " · not appraised, 10/10/10 assumed"}
        </div>
        <div className="truncate text-xs text-ink-300">
          <MoveName id={m.fast} data={data} />
          <span className="text-ink-600"> · </span>
          <MoveName id={m.charged} data={data} />
          {m.assumedMoves && <span className="ml-1.5 text-ink-400">(assumed)</span>}
        </div>
      </div>
      <div className="w-24">
        <Strength pct={pct} />
      </div>
    </li>
  );
}

function Strength({ pct }: { pct: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
        <span
          className="block h-full rounded-full bg-linear-to-r from-glow-500 to-ice-400"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </span>
      <span className="w-9 text-right text-xs text-ink-300 tabular-nums">{pct}%</span>
    </span>
  );
}

const tones = {
  violet: "bg-violet-400/15 text-violet-200",
  amber: "bg-amber-400/15 text-amber-200",
  glow: "bg-glow-500/15 text-glow-300",
};

function Badge({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
        on ? "border-glow-500/60 bg-glow-500/15 text-glow-300" : "border-ink-700 text-ink-400 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}
