import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { PokemonImage } from "../components/PokemonImage";
import { SearchStringPanel, copyText } from "../components/SearchStringPanel";
import { useAuth } from "../auth/AuthProvider";
import { changeTag, deletePokemon, useBag } from "../lib/bag";
import { toRows, toSearchable, type Row } from "../lib/bagRows";
import { useGameData } from "../lib/go/gamedata";
import { LEAGUES, type League } from "../lib/go/pvp";
import { buildSearches, type SearchResult } from "../lib/go/searchString";
import { GOOD_IV_RANK, INVESTED_LEVEL, KEEP_TAG, META_TOP, recommend, type Assessment } from "../lib/recommend";

type Tab = "transfer" | "pvp";

export default function Recommendations() {
  const { user } = useAuth();
  const { data, error: dataError } = useGameData();
  const bag = useBag();
  const [tab, setTab] = useState<Tab>("transfer");
  const [league, setLeague] = useState<League | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [searches, setSearches] = useState<SearchResult[] | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => (data ? toRows(bag.pokemon, data) : []), [bag.pokemon, data]);
  const recs = useMemo(() => (data ? recommend(rows, data) : null), [rows, data]);

  const list: Assessment[] = useMemo(() => {
    if (!recs) return [];
    if (tab === "transfer") return recs.transfer;
    return league === "all"
      ? recs.pvp
      : recs.pvp
          .filter((a) => a.pvp.some((p) => p.league === league && p.rank <= GOOD_IV_RANK))
          .sort((a, b) => bestIn(a, league) - bestIn(b, league));
  }, [recs, tab, league]);

  useEffect(() => {
    setSelected(new Set());
    setAnchor(null);
  }, [tab, league]);
  useEffect(() => {
    setSearches(null);
    setConfirmRemove(false);
  }, [selected]);
  useEffect(() => {
    // Drop selections that left the list (kept, removed, or tagged elsewhere).
    const ids = new Set(list.map((a) => a.row.id));
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [list]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  if (dataError) return <p className="px-8 py-8 text-rose-300">{dataError}. Refresh the page to try again.</p>;
  if (!data || !recs || bag.loading) return <p className="px-8 py-8 text-sm text-ink-400">Working out recommendations…</p>;

  const selectedRows = list.filter((a) => selected.has(a.row.id)).map((a) => a.row);

  const toggle = (id: string, shift: boolean) => {
    if (shift && anchor) {
      const ids = list.map((a) => a.row.id);
      const [i, j] = [ids.indexOf(anchor), ids.indexOf(id)].sort((a, b) => a - b);
      if (i !== -1) {
        setSelected((s) => new Set([...s, ...ids.slice(i, j + 1)]));
        setAnchor(id);
        return;
      }
    }
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };

  const allSelected = list.length > 0 && selected.size === list.length;

  const copySearch = async () => {
    const results = buildSearches(selectedRows.map(toSearchable), rows.map(toSearchable));
    setSearches(results);
    if (results.length === 1) {
      setNotice(
        (await copyText(results[0].query))
          ? "Copied. Paste it into the search bar on Pokémon GO's Pokémon screen."
          : "Couldn't copy automatically. Select the text and copy it.",
      );
    }
  };

  const keep = async (ids: string[], tag: string) => {
    if (!user) return;
    await changeTag(user.uid, ids, tag, true);
    setNotice(`Tagged ${ids.length} Pokémon #${tag}.${tag === KEEP_TAG ? " They won't be suggested again." : ""}`);
  };

  const remove = async () => {
    if (!user) return;
    const n = selected.size;
    await deletePokemon(user.uid, [...selected]);
    setNotice(`Removed ${n} transferred Pokémon from your bag.`);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Recommendations"
        subtitle={`Based on the ${rows.length.toLocaleString()} Pokémon in your bag`}
      />

      {rows.length === 0 ? (
        <div className="mx-8 mt-8 max-w-xl text-sm leading-relaxed text-ink-300">
          <h2 className="text-lg font-bold text-ink-100">Nothing to recommend yet</h2>
          <p className="mt-2">
            Add Pokémon to your{" "}
            <Link to="/bag" className="text-glow-400 hover:text-glow-300">
              bag
            </Link>{" "}
            with their appraisal, and Shinboku will point out which ones to transfer and which ones are worth keeping
            for Battle League.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-1 border-b border-ink-800 px-8 pt-3">
            <TabButton on={tab === "transfer"} onClick={() => setTab("transfer")} count={recs.transfer.length}>
              Transfer
            </TabButton>
            <TabButton on={tab === "pvp"} onClick={() => setTab("pvp")} count={recs.pvp.length}>
              Keep for Battle League
            </TabButton>
            {tab === "pvp" && (
              <div className="mb-2 ml-auto flex gap-1">
                {(["all", "gl", "ul"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLeague(l)}
                    aria-pressed={league === l}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                      league === l
                        ? "border-glow-500/60 bg-glow-500/15 text-glow-300"
                        : "border-ink-700 text-ink-300 hover:text-ink-100"
                    }`}
                  >
                    {l === "all" ? "All leagues" : LEAGUES[l].name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="border-b border-ink-800 px-8 py-3 text-sm leading-relaxed text-ink-300">
            {tab === "transfer" ? (
              <>
                Shinboku only suggests a transfer when you have a copy of the same species with better IVs and nothing
                about this one is special. Favorites, shinies, luckies, shadows, Legendary and Mythical Pokémon, tagged
                Pokémon, Elite TM moves, anything powered up past level {INVESTED_LEVEL}, and good league IVs are never
                suggested.
              </>
            ) : (
              <>
                IV rank compares a Pokémon's IVs with all 4,096 possible spreads for that league, powered up to the best
                level at or under the CP cap (up to level 50). Only species in PvPoke's top {META_TOP} for a league are
                listed, including what your Pokémon can evolve into. Ranks in the top {GOOD_IV_RANK} are shown here.
              </>
            )}
            {recs.unappraised > 0 && (
              <span className="text-ink-400">
                {" "}
                {recs.unappraised.toLocaleString()} Pokémon without an appraisal are left out.
              </span>
            )}
          </p>

          <div className="relative">
            <div
              className={`flex h-12 items-center gap-2 border-b px-8 text-sm ${
                selected.size ? "border-glow-500/30 bg-glow-500/[0.07]" : "border-ink-800"
              }`}
            >
              <label className="flex cursor-pointer items-center gap-2 pr-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((a) => a.row.id)))}
                  className="h-4 w-4 accent-glow-500"
                  aria-label="Select all"
                  disabled={list.length === 0}
                />
                <span className={selected.size ? "font-semibold text-glow-300" : "text-ink-400"}>
                  {selected.size ? `${selected.size.toLocaleString()} selected` : "Select all"}
                </span>
              </label>
              {selected.size === 0 ? (
                <span className="truncate text-ink-400">
                  {notice ??
                    (tab === "transfer"
                      ? "Select Pokémon, copy the search string into Pokémon GO, transfer them there, then remove them here."
                      : "Tag the ones you plan to use so they're easy to find in your bag.")}
                </span>
              ) : (
                <>
                  <Action primary onClick={() => void copySearch()}>
                    Copy search string
                  </Action>
                  {tab === "transfer" ? (
                    <Action onClick={() => void keep([...selected], KEEP_TAG)}>Keep these</Action>
                  ) : (
                    <Action onClick={() => void keep([...selected], "PvP")}>Tag #PvP</Action>
                  )}
                  <span className="min-w-0 flex-1 truncate text-glow-300">{notice}</span>
                  {tab === "transfer" &&
                    (confirmRemove ? (
                      <span className="flex items-center gap-2">
                        <span className="text-rose-200">Only do this after transferring them in the game.</span>
                        <Action danger onClick={() => void remove()}>
                          Remove {selected.size}
                        </Action>
                        <Action onClick={() => setConfirmRemove(false)}>Cancel</Action>
                      </span>
                    ) : (
                      <Action danger onClick={() => setConfirmRemove(true)}>
                        Remove from bag
                      </Action>
                    ))}
                </>
              )}
            </div>
            {searches && (
              <SearchStringPanel
                results={searches}
                onClose={() => setSearches(null)}
                onCopy={async (q) =>
                  setNotice((await copyText(q)) ? "Copied." : "Couldn't copy automatically. Select the text and copy it.")
                }
              />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-8 py-8 text-sm text-ink-400">
                {tab === "transfer"
                  ? "Nothing to transfer right now. Every Pokémon is either your best of its species or has a reason to stay."
                  : "None of your appraised Pokémon rank in the top 100 for a league where their species is competitive."}
              </p>
            ) : tab === "transfer" ? (
              <TransferTable
                list={list}
                selected={selected}
                onToggle={toggle}
                onToggleMany={(ids, on) =>
                  setSelected((s) => {
                    const next = new Set(s);
                    for (const id of ids) {
                      if (on) next.add(id);
                      else next.delete(id);
                    }
                    return next;
                  })
                }
                onKeep={(id) => void keep([id], KEEP_TAG)}
              />
            ) : (
              <PvpTable list={list} league={league} selected={selected} onToggle={toggle} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

const bestIn = (a: Assessment, league: League) =>
  Math.min(...a.pvp.filter((p) => p.league === league).map((p) => p.rank));

function TransferTable({
  list,
  selected,
  onToggle,
  onToggleMany,
  onKeep,
}: {
  list: Assessment[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onToggleMany: (ids: string[], on: boolean) => void;
  onKeep: (id: string) => void;
}) {
  // One group per species, headed by the copy Shinboku suggests keeping.
  const groups: { keeper: Row; items: Assessment[] }[] = [];
  for (const a of list) {
    const last = groups[groups.length - 1];
    if (last && last.keeper.id === a.best!.id) last.items.push(a);
    else groups.push({ keeper: a.best!, items: [a] });
  }

  return (
    <table className="w-full table-fixed text-sm">
      <thead className="sticky top-0 z-10 bg-ink-950 text-xs text-ink-400">
        <tr className="border-b border-ink-800 text-left">
          <th className="w-12" />
          <th className="w-14" />
          <th className="w-24 px-3 py-2 text-right font-semibold">CP</th>
          <th className="w-36 px-3 py-2 font-semibold">IVs</th>
          <th className="px-3 py-2 font-semibold">Why it can go</th>
          <th className="w-28" />
        </tr>
      </thead>
      {groups.map(({ keeper, items }) => {
        const ids = items.map((a) => a.row.id);
        const all = ids.every((id) => selected.has(id));
        return (
          <tbody key={keeper.id}>
            <tr className="border-b border-ink-800 bg-ink-900/70">
              <td className="pl-8">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={() => onToggleMany(ids, !all)}
                  className="h-4 w-4 accent-glow-500"
                  aria-label={`Select all ${items.length} ${keeper.sp.name} suggestions`}
                />
              </td>
              <td className="px-1 py-1">
                <PokemonImage species={keeper.sp} style="pixel" size={40} shiny={keeper.shiny} />
              </td>
              <td colSpan={4} className="px-3 py-2">
                <span className="font-display text-base font-bold">{keeper.sp.name}</span>
                <span className="ml-3 text-ink-300">
                  Keeping your {keeper.cp.toLocaleString()} CP {keeper.sp.name} with {keeper.ivPct}% IVs ({keeper.iv!.join("/")})
                </span>
                <span className="ml-3 rounded-full bg-ink-800 px-2 py-0.5 text-xs text-ink-300">
                  {items.length} to transfer
                </span>
              </td>
            </tr>
            {items.map((a) => (
              <SelectableRow key={a.row.id} a={a} selected={selected} onToggle={onToggle} sprite={false}>
                <td className="px-3 text-right font-display font-semibold tabular-nums">
                  {a.row.cp.toLocaleString()}
                </td>
                <td className="px-3 tabular-nums">
                  {a.row.ivPct}% <span className="text-xs text-ink-400">{a.row.iv!.join("/")}</span>
                </td>
                <td className="px-3 py-2 leading-snug text-ink-300">
                  {a.dominated ? "Your keeper's IVs are equal or better in every stat." : "Your keeper has better IVs overall."}
                  {a.leagueNote && <span className="text-ink-400"> {a.leagueNote}.</span>}
                  {a.row.nickname && <span className="text-ink-400"> “{a.row.nickname}”</span>}
                </td>
                <td className="px-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onKeep(a.row.id);
                    }}
                    className="rounded-md border border-ink-700 px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800 hover:text-ink-100"
                    title={`Tag it #${KEEP_TAG} so it isn't suggested again`}
                  >
                    Keep it
                  </button>
                </td>
              </SelectableRow>
            ))}
          </tbody>
        );
      })}
    </table>
  );
}

function PvpTable({
  list,
  league,
  selected,
  onToggle,
}: {
  list: Assessment[];
  league: League | "all";
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
}) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead className="sticky top-0 z-10 bg-ink-950 text-xs text-ink-400">
        <tr className="border-b border-ink-800 text-left">
          <th className="w-12" />
          <th className="w-14" />
          <th className="w-52 px-3 py-2 font-semibold">Pokémon</th>
          <th className="w-20 px-3 py-2 text-right font-semibold">CP</th>
          <th className="w-24 px-3 py-2 font-semibold">IVs</th>
          <th className="px-3 py-2 font-semibold">League value</th>
        </tr>
      </thead>
      <tbody>
        {list.map((a) => {
          const picks = a.pvp.filter((p) => p.rank <= GOOD_IV_RANK && (league === "all" || p.league === league));
          return (
            <SelectableRow key={a.row.id} a={a} selected={selected} onToggle={onToggle}>
              <td className="px-3">
                <span className="font-semibold">{a.row.sp.name}</span>
                {a.row.variant === "shadow" && (
                  <span className="ml-1.5 rounded bg-violet-400/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-200">
                    Shadow
                  </span>
                )}
                {a.row.tags?.includes("PvP") && <span className="ml-1.5 text-xs text-ink-400">#PvP</span>}
              </td>
              <td className="px-3 text-right font-display font-semibold tabular-nums">{a.row.cp.toLocaleString()}</td>
              <td className="px-3 text-xs text-ink-300 tabular-nums">{a.row.iv!.join(" / ")}</td>
              <td className="space-y-1 px-3 py-2">
                {picks.map((p) => (
                  <div
                    key={`${p.league}-${p.target.id}`}
                    className="grid grid-cols-[96px_52px_52px_1fr] items-baseline gap-x-3"
                  >
                    <span className={`text-xs font-semibold ${p.league === "gl" ? "text-sky-300" : "text-amber-200"}`}>
                      {LEAGUES[p.league].name}
                    </span>
                    <span className="font-display font-bold text-glow-300 tabular-nums">#{p.rank}</span>
                    <span className="text-xs text-ink-400 tabular-nums">{p.pct}%</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-ink-200">
                        {p.target.id !== a.row.sp.id && (
                          <>
                            Evolve to <span className="font-semibold">{p.target.name}</span>,{" "}
                          </>
                        )}
                        power up to level {p.level}{" "}
                        <span className="whitespace-nowrap">({p.cp.toLocaleString()} CP)</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                        {p.xl && <span className="rounded bg-ink-800 px-1.5 py-px text-[11px] text-ink-300">Needs XL Candy</span>}
                        {p.target.name} is #{p.metaRank} on PvPoke
                      </span>
                    </span>
                  </div>
                ))}
              </td>
            </SelectableRow>
          );
        })}
      </tbody>
    </table>
  );
}

function SelectableRow({
  a,
  selected,
  onToggle,
  children,
  sprite = true,
}: {
  a: Assessment;
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  children: ReactNode;
  sprite?: boolean;
}) {
  const isSel = selected.has(a.row.id);
  const box = useRef<HTMLInputElement>(null);
  return (
    <tr
      onMouseDown={(e) => e.shiftKey && e.preventDefault()}
      onClick={(e) => {
        if (e.target === box.current) return;
        onToggle(a.row.id, e.shiftKey);
      }}
      className={`cursor-default border-b border-ink-850 ${isSel ? "bg-glow-500/12" : "hover:bg-ink-900"}`}
    >
      <td className="pl-8">
        <input
          ref={box}
          type="checkbox"
          checked={isSel}
          onChange={(e) => onToggle(a.row.id, (e.nativeEvent as MouseEvent).shiftKey)}
          className="h-4 w-4 accent-glow-500"
          aria-label={`Select ${a.row.sp.name}, ${a.row.cp} CP`}
        />
      </td>
      <td className="px-1 py-0.5">
        {sprite && <PokemonImage species={a.row.sp} style="pixel" size={40} shiny={a.row.shiny} />}
      </td>
      {children}
    </tr>
  );
}

function TabButton({ on, onClick, count, children }: { on: boolean; onClick: () => void; count: number; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`-mb-px border-b-2 px-3 pb-2.5 text-sm font-semibold ${
        on ? "border-glow-400 text-ink-100" : "border-transparent text-ink-400 hover:text-ink-100"
      }`}
    >
      {children}
      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${on ? "bg-glow-500/20 text-glow-300" : "bg-ink-800"}`}>
        {count.toLocaleString()}
      </span>
    </button>
  );
}

function Action({
  onClick,
  children,
  primary,
  danger,
}: {
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-sm font-semibold ${
        primary
          ? "bg-linear-to-r from-glow-400 to-ice-400 text-ink-950 hover:brightness-110"
          : danger
            ? "border border-rose-400/40 text-rose-200 hover:bg-rose-400/15"
            : "border border-ink-700 text-ink-100 hover:bg-ink-800"
      }`}
    >
      {children}
    </button>
  );
}
