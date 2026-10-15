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

  if (error) return <p className="px-8 py-8 text-rose-300">{error}. Refresh the page to try again.</p>;
  if (!data) return <p className="px-8 py-8 text-sm text-ink-400">Loading…</p>;

  return (
    <div className="pb-12">
      <PageHeader
        title="Catch up"
        subtitle="Get a big collection into Shinboku in a few evenings instead of a few weeks"
      />
      <div className="flex gap-1 border-b border-ink-800 px-8 pt-3">
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
  const [copiedPart, setCopiedPart] = useState<number | null>(null);
  const result = useMemo(() => cleanupSearch(data, { maxStars }), [data, maxStars]);

  return (
    <div className="max-w-4xl px-8 pt-6">
      <p className="text-sm leading-relaxed text-ink-300">
        Most big bags are full of low-IV Pokémon that will never be worth using. Transfer those in the game{" "}
        <em>before</em> you enter anything, and every one of them is a Pokémon you never have to type. This search uses
        the game's own appraisal stars, so you don't have to appraise anything first.
      </p>

      <div className="mt-5 flex items-center gap-3 text-sm">
        <span className="text-ink-400">Find Pokémon with</span>
        <div className="flex rounded-lg border border-ink-700 p-0.5">
          {([0, 1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => setMaxStars(n)}
              aria-pressed={maxStars === n}
              className={`rounded-md px-3 py-1 font-semibold ${
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

      <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <code className="block max-h-40 overflow-y-auto font-mono text-xs leading-relaxed break-all text-ink-200">
          {result.query}
        </code>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={async () => setCopied(await copyText(result.query))}
            className="rounded-md bg-linear-to-r from-glow-400 to-ice-400 px-3 py-1.5 text-sm font-bold text-ink-950 hover:brightness-110"
          >
            Copy search string
          </button>
          <span className="text-xs text-ink-400">
            {copied === true
              ? "Copied. Paste it into the search bar on Pokémon GO's Pokémon screen."
              : copied === false
                ? "Couldn't copy automatically. Select the text and copy it."
                : `${result.query.length.toLocaleString()} characters`}
          </span>
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-400 hover:text-ink-100">
          Game cutting the string off? Use {result.parts.length} shorter ones instead
        </summary>
        <ul className="mt-2 space-y-2">
          {result.parts.map((part, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-ink-800 bg-ink-900/60 p-2">
              <span className="mt-0.5 text-xs text-ink-400 tabular-nums">
                {i + 1}/{result.parts.length}
              </span>
              <code className="min-w-0 flex-1 font-mono text-xs break-all text-ink-300">{part}</code>
              <button
                onClick={async () => setCopiedPart((await copyText(part)) ? i : null)}
                className="rounded-md border border-ink-700 px-2 py-0.5 text-xs font-semibold hover:bg-ink-800"
              >
                {copiedPart === i ? "Copied" : "Copy"}
              </button>
            </li>
          ))}
        </ul>
      </details>

      <h3 className="mt-6 text-sm font-bold">What it never finds</h3>
      <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-ink-300">
        <li>
          {result.keptSpecies.toLocaleString()} species whose line matters in Great or Ultra League or as a top raid
          attacker, at any IVs (the best league IVs are often 1★)
        </li>
        <li>Shiny, lucky, Shadow and purified Pokémon</li>
        <li>Legendary, Mythical and Ultra Beast Pokémon</li>
        <li>Costumes, Dynamax and Gigantamax, and special or location backgrounds</li>
        <li>Favorites and anything you've tagged</li>
        <li>Pokémon that know a legacy or Elite TM move</li>
      </ul>

      <h3 className="mt-6 text-sm font-bold">How to use it</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-300">
        <li>Paste the string into the search bar on the Pokémon screen in Pokémon GO.</li>
        <li>
          Scroll through the results. Favorite or tag anything you want to keep for your own reasons (a buddy, a
          collection, candy for a Pokémon you're building).
        </li>
        <li>Search again, then long-press one, choose select all, and transfer.</li>
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
    <div className="px-8 pt-6">
      <p className="max-w-4xl text-sm leading-relaxed text-ink-300">
        Work through your bag one evolution family at a time. Searching <code className="text-glow-300">+machop</code>{" "}
        in Pokémon GO shows every Machop, Machoke and Machamp together, and Shinboku keeps the species selected so each
        one is just a CP and an appraisal. Mark a family done and move on to the next.
      </p>

      <div className="mt-5 flex items-center gap-4">
        <div className="h-2 w-80 overflow-hidden rounded-full bg-ink-800">
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
        <div className="mt-5 flex max-w-4xl items-center gap-4 rounded-2xl border border-glow-500/30 bg-glow-500/[0.06] p-4">
          <PokemonImage species={next.root} style="home" size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wider text-glow-400 uppercase">Up next</p>
            <p className="font-display text-xl font-bold">{familyName(next)}</p>
            <p className="text-sm text-ink-400">
              {next.count ? `${next.count} entered so far` : "None entered yet"} · search{" "}
              <code className="text-ink-200">+{searchName(next.root)}</code>
            </p>
          </div>
          <SmallButton onClick={() => void copy(next)}>{copied === next.id ? "Copied" : "Copy search"}</SmallButton>
          <SmallButton primary onClick={() => enter(next)}>
            Enter them
          </SmallButton>
          <SmallButton onClick={() => toggle(next)}>Mark done</SmallButton>
        </div>
      )}

      <div className="mt-6 flex items-center gap-2">
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
          className="ml-2 w-56 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1 text-sm placeholder:text-ink-400 focus:border-glow-500 focus:outline-none"
        />
        <span className="ml-auto text-xs text-ink-400">Families you've marked done are saved to your account.</span>
      </div>

      <table className="mt-3 w-full table-fixed text-sm">
        <tbody>
          {list.slice(0, 400).map((f) => (
            <tr key={f.id} className="border-b border-ink-850 hover:bg-ink-900">
              <td className="w-16 py-1">
                <input
                  type="checkbox"
                  checked={done.has(f.id)}
                  onChange={() => toggle(f)}
                  className="h-4 w-4 accent-glow-500"
                  aria-label={`${familyName(f)} done`}
                />
              </td>
              <td className="w-16 text-xs text-ink-400 tabular-nums">#{String(f.root.dex).padStart(3, "0")}</td>
              <td className="py-1">
                <span className="flex items-center gap-1">
                  {f.members.slice(0, 6).map((m) => (
                    <PokemonImage key={m.id} species={m} style="pixel" size={34} />
                  ))}
                  <span className="ml-2 font-semibold">{familyName(f)}</span>
                </span>
              </td>
              <td className="w-32 text-ink-300 tabular-nums">{f.count ? `${f.count} entered` : ""}</td>
              <td className="w-64 text-right">
                <span className="inline-flex gap-1.5">
                  <SmallButton onClick={() => void copy(f)}>
                    {copied === f.id ? "Copied" : `Copy +${searchName(f.root)}`}
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
    <div className="px-8 pt-6">
      <p className="max-w-4xl text-sm leading-relaxed text-ink-300">
        Appraising takes the most taps, so you can skip it while entering and come back for the ones where IVs matter.
        These are your unappraised Pokémon whose evolution line is competitive in Great or Ultra League or a top raid
        attacker. Find them in the game with the search string, then type each appraisal here and press Enter.
      </p>
      <div className="relative mt-5 flex items-center gap-3">
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
          <div className="absolute top-full left-0 w-[640px]">
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
              <th className="w-14" />
              <th className="w-56 py-2 font-semibold">Pokémon</th>
              <th className="w-20 py-2 text-right font-semibold">CP</th>
              <th className="w-56 py-2 pl-6 font-semibold">Appraisal</th>
              <th className="py-2 font-semibold">Why</th>
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
      </td>
      <td className="text-right font-display font-semibold tabular-nums">{r.cp.toLocaleString()}</td>
      <td className="py-1.5 pl-6">
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
          className={`w-32 rounded-md border bg-ink-950 px-2 py-1 text-sm placeholder:text-ink-600 focus:outline-none ${
            error ? "border-rose-400/60" : "border-ink-700 focus:border-glow-500"
          }`}
        />
        {error && <p className="mt-0.5 text-xs text-rose-300">{error}</p>}
      </td>
      <td className="truncate text-xs text-ink-400" title={item.reasons.join(" · ")}>
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
