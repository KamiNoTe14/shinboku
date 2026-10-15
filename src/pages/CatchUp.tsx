import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/PageHeader";
import { PokemonImage } from "../components/PokemonImage";
import { SearchStringPanel, copyText } from "../components/SearchStringPanel";
import { patchPokemon, useBag } from "../lib/bag";
import { toRows, toSearchable } from "../lib/bagRows";
import { appraisalQueue, cleanupSearch, families, searchName, type AppraisalItem, type Family } from "../lib/catchup";
import { parseAppraisal } from "../lib/go/entry";
import { useGameData, type GameData } from "../lib/go/gamedata";
import { buildSearches, type SearchResult } from "../lib/go/searchString";
import { matchingLevels } from "../lib/go/stats";
import { markFamilyDone, useSettings } from "../lib/settings";

type Tab = "cleanup" | "families" | "appraise";

export default function CatchUp() {
  const { data, error } = useGameData();
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem("catchup.tab") as Tab) || "cleanup";
    } catch {
      return "cleanup";
    }
  });
  const choose = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("catchup.tab", t);
    } catch {}
  };

  if (error) return <p className="px-4 sm:px-8 py-8 text-rose-300">{error}. Refresh the page to try again.</p>;
  if (!data) return <p className="px-4 sm:px-8 py-8 text-sm text-ink-400">Loading…</p>;

  return (
    <div className="pb-12">
      <PageHeader
        title="Catch up"
        subtitle="Get a big collection into Shinboku in a few evenings instead of a few weeks"
      />
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-800 px-4 pt-3 whitespace-nowrap sm:px-8">
        <TabButton n={1} on={tab === "cleanup"} onClick={() => choose("cleanup")}>
          Clean up first
        </TabButton>
        <TabButton n={2} on={tab === "families"} onClick={() => choose("families")}>
          Enter by family
        </TabButton>
        <TabButton n={3} on={tab === "appraise"} onClick={() => choose("appraise")}>
          Appraise what matters
        </TabButton>
      </div>
      {tab === "cleanup" && <Cleanup data={data} />}
      {tab === "families" && <Families data={data} />}
      {tab === "appraise" && <Appraise data={data} />}
    </div>
  );
}

// ---------------------------------------------------------------- 1. clean up

function Cleanup({ data }: { data: GameData }) {
  const [maxStars, setMaxStars] = useState<0 | 1 | 2>(1);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [copiedPart, setCopiedPart] = useState<Set<number>>(new Set());
  const result = useMemo(() => cleanupSearch(data, { maxStars }), [data, maxStars]);
  useEffect(() => setCopiedPart(new Set()), [maxStars]);

  return (
    <div className="max-w-4xl px-4 sm:px-8 pt-6">
      <p className="text-sm leading-relaxed text-ink-300">
        Most big bags are full of low-IV Pokémon that will never be worth using. Transfer those in the game{" "}
        <em>before</em> you enter anything, and every one of them is a Pokémon you never have to type. This search uses
        the game's own appraisal stars, so you don't have to appraise anything first.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-ink-400">Find Pokémon with</span>
        <div className="flex rounded-lg border border-ink-700 p-0.5">
          {([0, 1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => setMaxStars(n)}
              aria-pressed={maxStars === n}
              className={`rounded-md px-3 py-1 font-semibold whitespace-nowrap ${
                maxStars === n ? "bg-glow-500/15 text-glow-300" : "text-ink-400 hover:text-ink-100"
              }`}
            >
              {n === 0 ? "0★" : `0–${n}★`}
            </button>
          ))}
        </div>
        <span className="text-ink-400">
          {maxStars === 2 ? "Bolder: 2★ is up to 80% IVs." : maxStars === 1 ? "Recommended." : "Most cautious."}
        </span>
      </div>

      <p className="mt-5 text-sm text-ink-300">
        Run these {result.parts.length} searches one after another. Each one is short enough for the game to read in
        full, and each covers a different range of Pokédex numbers.
      </p>
      <ol className="mt-3 space-y-2">
        {result.parts.map((part, i) => (
          <li
            key={part.query}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 ${
              copiedPart.has(i) ? "border-ink-800 bg-ink-900/40" : "border-ink-700 bg-ink-900"
            }`}
          >
            <span className="font-display text-sm font-bold text-ink-100">Search {i + 1}</span>
            <span className="text-xs text-ink-400 tabular-nums">
              #{part.fromDex}–#{part.toDex}
            </span>
            <button
              onClick={async () => {
                if (await copyText(part.query)) setCopiedPart((c) => new Set(c).add(i));
              }}
              className={`ml-auto rounded-md px-3 py-1.5 text-sm font-bold ${
                copiedPart.has(i)
                  ? "border border-ink-700 text-ink-300 hover:bg-ink-800"
                  : "bg-linear-to-r from-glow-400 to-ice-400 text-ink-950 hover:brightness-110"
              }`}
            >
              {copiedPart.has(i) ? "Copied ✓" : "Copy"}
            </button>
            <code className="basis-full font-mono text-[11px] leading-relaxed break-all text-ink-400">{part.query}</code>
          </li>
        ))}
      </ol>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-400 hover:text-ink-100">Everything in one long string</summary>
        <p className="mt-2 text-xs text-amber-200">
          The game seems to ignore part of very long searches. In one test, shiny Pokémon showed up even though the
          string excluded them. Use the short searches above unless you've checked this one finds no shinies.
        </p>
        <code className="mt-2 block max-h-40 overflow-y-auto rounded-lg border border-ink-800 bg-ink-900 p-3 font-mono text-xs break-all text-ink-300">
          {result.query}
        </code>
        <button
          onClick={async () => setCopied(await copyText(result.query))}
          className="mt-2 rounded-md border border-ink-700 px-2.5 py-1 text-xs font-semibold hover:bg-ink-800"
        >
          {copied ? "Copied" : "Copy the long string"}
        </button>
      </details>

      <h3 className="mt-6 text-sm font-bold">What it never finds</h3>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-ink-300 sm:grid-cols-2">
        <li>
          {result.keptSpecies.toLocaleString()} species whose line matters in Great or Ultra League or as a top raid
          attacker, at any IVs (the best league IVs are often 1★)
        </li>
        <li>Shiny, lucky, Shadow and purified Pokémon</li>
        <li>Legendary, Mythical and Ultra Beast Pokémon</li>
        <li>Costumes, Dynamax and Gigantamax, and special or location backgrounds</li>
        <li>Favorites and anything you've tagged</li>
        <li>Pokémon that know a legacy or Elite TM move</li>
        <li>
          Zorua and Zoroark. The game's search doesn't seem to handle their Illusion: shiny Zorua slipped past
          "!shiny" in testing, so check those by hand.
        </li>
      </ul>

      <h3 className="mt-6 text-sm font-bold">How to use it</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-300">
        <li>Copy a search and paste it into the search bar on the Pokémon screen in Pokémon GO.</li>
        <li>
          Scroll through the results. Favorite or tag anything you want to keep for your own reasons (a buddy, a
          collection, candy for a Pokémon you're building).
        </li>
        <li>
          Quick check: no shiny sparkles, lucky backgrounds or Shadow flames should show up. If one does, favorite it
          before going on.
        </li>
        <li>Search again, then long-press one, choose select all, and transfer. Then on to the next search.</li>
      </ol>
      <p className="mt-4 text-xs text-ink-400">
        Already entered some of these in Shinboku? Use{" "}
        <Link to="/recommendations" className="text-glow-400 hover:text-glow-300">
          Recommendations
        </Link>{" "}
        for those instead, so your bag here stays in step with the game.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- 2. families

function Families({ data }: { data: GameData }) {
  const { user } = useAuth();
  const bag = useBag();
  const settings = useSettings();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"todo" | "done" | "all">("todo");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const rows = useMemo(() => toRows(bag.pokemon, data), [bag.pokemon, data]);
  const all = useMemo(() => families(data, rows), [data, rows]);
  const done = useMemo(() => new Set(settings?.doneFamilies ?? []), [settings]);
  const doneCount = all.filter((f) => done.has(f.id)).length;
  const next = all.find((f) => !done.has(f.id));

  const q = query.trim().toLowerCase();
  const list = all.filter(
    (f) =>
      (filter === "all" || (filter === "done") === done.has(f.id)) &&
      (!q || f.members.some((m) => m.name.toLowerCase().includes(q)) || String(f.root.dex) === q.replace("#", "")),
  );

  const copy = async (f: Family) => {
    const ok = await copyText(`+${searchName(f.root)}`);
    setCopied(ok ? f.id : null);
  };
  const enter = (f: Family) => navigate(`/bag?species=${f.root.id}`);
  const toggle = (f: Family) => user && void markFamilyDone(user.uid, f.id, !done.has(f.id));

  return (
    <div className="px-4 sm:px-8 pt-6">
      <p className="max-w-4xl text-sm leading-relaxed text-ink-300">
        Work through your bag one evolution family at a time. Searching <code className="text-glow-300">+machop</code>{" "}
        in Pokémon GO shows every Machop, Machoke and Machamp together, and Shinboku keeps the species selected so each
        one is just a CP and an appraisal. Mark a family done and move on to the next.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="h-2 w-full sm:w-80 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-linear-to-r from-glow-500 to-ice-400"
            style={{ width: `${(doneCount / Math.max(1, all.length)) * 100}%` }}
          />
        </div>
        <span className="text-sm text-ink-300 tabular-nums">
          {doneCount.toLocaleString()} of {all.length.toLocaleString()} families done
        </span>
        <span className="text-sm text-ink-400 tabular-nums">· {rows.length.toLocaleString()} Pokémon entered</span>
      </div>

      {next && (
        <div className="mt-5 flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-glow-500/30 bg-glow-500/[0.06] p-4">
          <PokemonImage species={next.root} style="home" size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wider text-glow-400 uppercase">Up next</p>
            <p className="font-display text-xl font-bold">{familyName(next)}</p>
            <p className="text-sm text-ink-400">
              {next.count ? `${next.count} entered so far` : "None entered yet"} · search{" "}
              <code className="text-ink-200">+{searchName(next.root)}</code>
            </p>
          </div>
          <div className="flex basis-full flex-wrap gap-2 sm:basis-auto">
            <SmallButton onClick={() => void copy(next)}>{copied === next.id ? "Copied" : "Copy search"}</SmallButton>
            <SmallButton primary onClick={() => enter(next)}>
              Enter them
            </SmallButton>
            <SmallButton onClick={() => toggle(next)}>Mark done</SmallButton>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(["todo", "done", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
              filter === f
                ? "border-glow-500/60 bg-glow-500/15 text-glow-300"
                : "border-ink-700 text-ink-300 hover:text-ink-100"
            }`}
          >
            {f === "todo" ? "To do" : f === "done" ? "Done" : "All"}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a family"
          aria-label="Find a family"
          className="min-w-0 flex-1 rounded-md sm:ml-2 sm:w-56 sm:flex-none border border-ink-700 bg-ink-900 px-2.5 py-1 text-sm placeholder:text-ink-400 focus:border-glow-500 focus:outline-none"
        />
        <span className="hidden text-xs text-ink-400 lg:ml-auto lg:inline">Families you've marked done are saved to your account.</span>
      </div>

      <table className="mt-3 w-full table-fixed text-sm">
        <tbody>
          {list.slice(0, 400).map((f) => (
            <tr key={f.id} className="border-b border-ink-850 hover:bg-ink-900">
              <td className="w-9 py-1 sm:w-16">
                <input
                  type="checkbox"
                  checked={done.has(f.id)}
                  onChange={() => toggle(f)}
                  className="h-4 w-4 accent-glow-500"
                  aria-label={`${familyName(f)} done`}
                />
              </td>
              <td className="hidden w-16 text-xs text-ink-400 tabular-nums sm:table-cell">#{String(f.root.dex).padStart(3, "0")}</td>
              <td className="py-1">
                <span className="flex items-center gap-1">
                  {f.members.slice(0, 6).map((m, i) => (
                    <span key={m.id} className={i > 0 ? "hidden sm:inline" : ""}>
                      <PokemonImage species={m} style="pixel" size={34} />
                    </span>
                  ))}
                  <span className="ml-2 min-w-0 font-semibold">
                    {familyName(f)}
                    {f.count > 0 && (
                      <span className="block text-xs font-normal text-ink-400 md:hidden">{f.count} entered</span>
                    )}
                  </span>
                </span>
              </td>
              <td className="hidden w-32 text-ink-300 tabular-nums md:table-cell">{f.count ? `${f.count} entered` : ""}</td>
              <td className="w-36 text-right sm:w-64">
                <span className="inline-flex gap-1.5">
                  <SmallButton onClick={() => void copy(f)}>
                    {copied === f.id ? (
                      "Copied"
                    ) : (
                      <>
                        Copy<span className="hidden sm:inline"> +{searchName(f.root)}</span>
                      </>
                    )}
                  </SmallButton>
                  <SmallButton onClick={() => enter(f)}>Enter</SmallButton>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length > 400 && <p className="mt-3 text-xs text-ink-400">Showing the first 400. Search to find others.</p>}
    </div>
  );
}

const familyName = (f: Family) => `${f.root.name.replace(/\s*\(.*\)/, "")} family`;

// ---------------------------------------------------------------- 3. appraise

function Appraise({ data }: { data: GameData }) {
  const { user } = useAuth();
  const bag = useBag();
  const rows = useMemo(() => toRows(bag.pokemon, data), [bag.pokemon, data]);
  const queue = useMemo(() => appraisalQueue(rows, data), [rows, data]);
  const unappraised = rows.filter((r) => !r.iv).length;
  const [searches, setSearches] = useState<SearchResult[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const save = async (item: AppraisalItem, text: string, force: boolean): Promise<string | null> => {
    const iv = parseAppraisal(text);
    if (!iv || iv === "invalid") return "Type three numbers from 0 to 15, like 15 14 13.";
    const r = item.row;
    const levels = matchingLevels(r.sp, { atk: iv[0], def: iv[1], sta: iv[2] }, r.cp, r.hp);
    if (!levels.length && !force) return `No ${r.sp.name} with this appraisal has ${r.cp} CP. Ctrl+Enter saves anyway.`;
    if (!user) return null;
    // Move focus to the next one before this row leaves the list.
    const i = queue.findIndex((x) => x.row.id === r.id);
    const nextId = queue[i + 1]?.row.id;
    patchPokemon(user.uid, r.id, { iv, level: levels.length === 1 ? levels[0] : null }).catch((err: Error) =>
      setNotice(`Couldn't save: ${err.message}`),
    );
    setNotice(`Saved ${r.sp.name}, ${r.cp.toLocaleString()} CP.`);
    if (nextId) setTimeout(() => inputs.current.get(nextId)?.focus(), 0);
    return null;
  };

  const copyAll = async () => {
    const results = buildSearches(
      queue.map((x) => toSearchable(x.row)),
      rows.map(toSearchable),
    );
    if (results.length === 1 && (await copyText(results[0].query))) {
      setNotice("Copied. Paste it into Pokémon GO to find them all.");
      setSearches(null);
    } else setSearches(results);
  };

  return (
    <div className="px-4 sm:px-8 pt-6">
      <p className="max-w-4xl text-sm leading-relaxed text-ink-300">
        Appraising takes the most taps, so you can skip it while entering and come back for the ones where IVs matter.
        These are your unappraised Pokémon whose evolution line is competitive in Great or Ultra League or a top raid
        attacker. Find them in the game with the search string, then type each appraisal here and press Enter.
      </p>
      <div className="relative mt-5 flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-300">
          <span className="font-semibold text-ink-100">{queue.length.toLocaleString()}</span> worth appraising
          <span className="text-ink-400"> of {unappraised.toLocaleString()} without an appraisal</span>
        </span>
        {queue.length > 0 && (
          <SmallButton primary onClick={() => void copyAll()}>
            Copy search string
          </SmallButton>
        )}
        {notice && <span className="text-sm text-glow-300">{notice}</span>}
        {searches && (
          <div className="absolute top-full left-0 w-[min(640px,calc(100vw-2rem))]">
            <SearchStringPanel
              results={searches}
              onClose={() => setSearches(null)}
              onCopy={async (q) => setNotice((await copyText(q)) ? "Copied." : null)}
            />
          </div>
        )}
      </div>

      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-ink-400">
          {unappraised
            ? "Nothing here needs appraising. The rest of your unappraised Pokémon are from lines where IVs don't change much."
            : "Everything in your bag has been appraised."}
        </p>
      ) : (
        <table className="mt-4 w-full table-fixed text-sm">
          <thead className="text-xs text-ink-400">
            <tr className="border-b border-ink-800 text-left">
              <th className="w-11 sm:w-14" />
              <th className="py-2 font-semibold md:w-56">Pokémon</th>
              <th className="w-16 py-2 text-right font-semibold sm:w-20">CP</th>
              <th className="w-28 py-2 pl-3 font-semibold sm:w-56 sm:pl-6">Appraisal</th>
              <th className="hidden py-2 font-semibold md:table-cell">Why</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => (
              <AppraiseRow
                key={item.row.id}
                item={item}
                inputRef={(el) => {
                  if (el) inputs.current.set(item.row.id, el);
                  else inputs.current.delete(item.row.id);
                }}
                onSave={save}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AppraiseRow({
  item,
  inputRef,
  onSave,
}: {
  item: AppraisalItem;
  inputRef: (el: HTMLInputElement | null) => void;
  onSave: (item: AppraisalItem, text: string, force: boolean) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [text]);
  const r = item.row;
  return (
    <tr className="border-b border-ink-850">
      <td className="py-1">
        <PokemonImage species={r.sp} style="pixel" size={36} shiny={r.shiny} />
      </td>
      <td>
        <span className="font-semibold">{r.sp.name}</span>
        {r.variant === "shadow" && <span className="ml-1.5 text-xs text-violet-200">Shadow</span>}
        {r.shiny && <span className="ml-1.5 text-amber-300">✦</span>}
        <span className="block truncate text-xs text-ink-400 md:hidden">{item.reasons[0]}</span>
      </td>
      <td className="text-right font-display font-semibold tabular-nums">{r.cp.toLocaleString()}</td>
      <td className="py-1.5 pl-3 sm:pl-6">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            setError(await onSave(item, text, e.ctrlKey || e.metaKey));
          }}
          placeholder="15 14 13"
          aria-label={`Appraisal for ${r.sp.name}, ${r.cp} CP`}
          inputMode="decimal"
          enterKeyHint="next"
          className={`w-24 rounded-md border bg-ink-950 px-2 py-1 text-sm sm:w-32 placeholder:text-ink-600 focus:outline-none ${
            error ? "border-rose-400/60" : "border-ink-700 focus:border-glow-500"
          }`}
        />
        {error && <p className="mt-0.5 text-xs text-rose-300">{error}</p>}
      </td>
      <td className="hidden truncate text-xs text-ink-400 md:table-cell" title={item.reasons.join(" · ")}>
        {item.reasons.slice(0, 2).join(" · ")}
        {item.reasons.length > 2 && ` +${item.reasons.length - 2} more`}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- shared

function TabButton({ n, on, onClick, children }: { n: number; on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 text-sm font-semibold ${
        on ? "border-glow-400 text-ink-100" : "border-transparent text-ink-400 hover:text-ink-100"
      }`}
    >
      <span
        className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${on ? "bg-glow-500/25 text-glow-300" : "bg-ink-800"}`}
      >
        {n}
      </span>
      {children}
    </button>
  );
}

function SmallButton({ onClick, primary, children }: { onClick: () => void; primary?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-sm font-semibold whitespace-nowrap ${
        primary
          ? "bg-linear-to-r from-glow-400 to-ice-400 text-ink-950 hover:brightness-110"
          : "border border-ink-700 text-ink-100 hover:bg-ink-800"
      }`}
    >
      {children}
    </button>
  );
}
