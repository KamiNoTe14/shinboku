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
import { describeCost } from "../lib/go/powerup";
import { TypeBadge } from "../components/TypeBadge";
import {
  evolveSuggestions,
  powerUpPlan,
  RAID_LEVEL,
  RAID_TOP,
  requirements,
  typeRanking,
  type EvolveReason,
  type EvolveSuggestion,
  type PowerUpGroup,
} from "../lib/raids";
import type { GameData } from "../lib/go/gamedata";

type Tab = "transfer" | "pvp" | "evolve" | "power";

/** Anything listed with a checkbox. The same Pokémon can appear more than once (e.g. under two types). */
type Item = { row: Row; key: string };

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
  const [showHelp, setShowHelp] = useState(false);

  const rows = useMemo(() => (data ? toRows(bag.pokemon, data) : []), [bag.pokemon, data]);
  const recs = useMemo(() => (data ? recommend(rows, data) : null), [rows, data]);

  const evolve = useMemo(() => (data && recs ? evolveSuggestions(recs.all, data) : []), [recs, data]);
  const power = useMemo(() => (data ? powerUpPlan(rows, data) : []), [rows, data]);
  const powerCount = useMemo(
    () => new Set(power.flatMap((g) => g.picks.filter((p) => p.level < RAID_LEVEL).map((p) => p.row.id))).size,
    [power],
  );

  const pvpList: Assessment[] = useMemo(() => {
    if (!recs) return [];
    return league === "all"
      ? recs.pvp
      : recs.pvp
          .filter((a) => a.pvp.some((p) => p.league === league && p.rank <= GOOD_IV_RANK))
          .sort((a, b) => bestIn(a, league) - bestIn(b, league));
  }, [recs, league]);

  const list: Item[] = useMemo(() => {
    if (!recs) return [];
    if (tab === "transfer") return recs.transfer.map((a) => ({ row: a.row, key: a.row.id }));
    if (tab === "evolve") return evolve.map((e) => ({ row: e.row, key: `${e.row.id}>${e.target.id}` }));
    if (tab === "power") return power.flatMap((g) => g.picks.map((p) => ({ row: p.row, key: `${g.type}|${p.row.id}` })));
    return pvpList.map((a) => ({ row: a.row, key: a.row.id }));
  }, [recs, tab, pvpList, evolve, power]);

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

  if (dataError) return <p className="px-4 sm:px-8 py-8 text-rose-300">{dataError}. Refresh the page to try again.</p>;
  if (!data || !recs || bag.loading) return <p className="px-4 sm:px-8 py-8 text-sm text-ink-400">Working out recommendations…</p>;

  const selectedRows = [...new Map(list.filter((a) => selected.has(a.row.id)).map((a) => [a.row.id, a.row])).values()];

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

  const listIds = new Set(list.map((a) => a.row.id));
  const allSelected = list.length > 0 && selected.size === listIds.size;

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
    <div className="flex min-h-full flex-col lg:h-full">
      <PageHeader
        title="Recommendations"
        subtitle={`Based on the ${rows.length.toLocaleString()} Pokémon in your bag`}
      />

      {rows.length === 0 ? (
        <div className="mx-4 sm:mx-8 mt-8 max-w-xl text-sm leading-relaxed text-ink-300">
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
          <div className="flex flex-wrap items-end gap-x-1 border-b border-ink-800 px-4 pt-3 sm:px-8">
            <div className="no-scrollbar -mx-4 flex min-w-0 basis-full items-end gap-1 overflow-x-auto px-4 whitespace-nowrap sm:mx-0 sm:basis-auto sm:px-0">
            <TabButton on={tab === "transfer"} onClick={() => setTab("transfer")} count={recs.transfer.length}>
              Transfer
            </TabButton>
            <TabButton on={tab === "pvp"} onClick={() => setTab("pvp")} count={recs.pvp.length}>
              Keep for Battle League
            </TabButton>
            <TabButton on={tab === "evolve"} onClick={() => setTab("evolve")} count={evolve.length}>
              Evolve
            </TabButton>
            <TabButton on={tab === "power"} onClick={() => setTab("power")} count={powerCount}>
              Power up for raids
            </TabButton>
            </div>
            {tab === "pvp" && (
              <div className="mb-2 flex gap-1 pt-2 sm:ml-auto sm:pt-0">
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

          <button
            onClick={() => setShowHelp((x) => !x)}
            aria-expanded={showHelp}
            className="w-full border-b border-ink-800 px-4 py-2 text-left text-xs font-semibold text-ink-400 sm:hidden"
          >
            {showHelp ? "Hide how this works" : "How this works"}
          </button>
          <p
            className={`border-b border-ink-800 px-4 py-3 text-sm leading-relaxed text-ink-300 sm:block sm:px-8 ${
              showHelp ? "" : "hidden"
            }`}
          >
            {tab === "transfer" ? (
              <>
                Shinboku only suggests a transfer when you have a copy of the same species with better IVs and nothing
                about this one is special. Favorites, shinies, luckies, shadows, Legendary and Mythical Pokémon, tagged
                Pokémon, Elite TM moves, anything powered up past level {INVESTED_LEVEL}, and good league IVs are never
                suggested.
              </>
            ) : tab === "evolve" ? (
              <>
                Evolutions worth spending candy on: for good league IVs as the evolved Pokémon, because the evolution is
                one of the top {RAID_TOP} raid attackers of its type, or to fill a new Pokédex entry. Raid and Pokédex
                suggestions use your best copy of each species. Check your candy in the game first.
              </>
            ) : tab === "power" ? (
              <>
                Your strongest raid attackers of each type once powered up to level {RAID_LEVEL}, compared with the best
                attacker of that type in the game (90% means about 90% as strong), and the stardust and candy it takes to
                get there. Pokémon that can still evolve are in the Evolve tab instead. Pokémon without moves entered are
                assumed to have their best moves of that type.
              </>
            ) : (
              <>
                IV rank compares a Pokémon's IVs with all 4,096 possible spreads for that league, powered up to the best
                level at or under the CP cap (up to level 50). Only species in PvPoke's top {META_TOP} for a league are
                listed, including what your Pokémon can evolve into. Ranks in the top {GOOD_IV_RANK} are shown here.
              </>
            )}
            {recs.unappraised > 0 && (tab === "transfer" || tab === "pvp") && (
              <span className="text-ink-400">
                {" "}
                {recs.unappraised.toLocaleString()} Pokémon without an appraisal are left out.
              </span>
            )}
          </p>

          <div className="relative">
            <div
              className={`no-scrollbar flex h-12 items-center gap-2 overflow-x-auto border-b px-4 text-sm whitespace-nowrap sm:px-8 [&>*]:shrink-0 ${
                selected.size ? "border-glow-500/30 bg-glow-500/[0.07]" : "border-ink-800"
              }`}
            >
              <label className="flex cursor-pointer items-center gap-2 pr-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : listIds)}
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
                      : tab === "evolve"
                        ? "Select Pokémon and copy the search string to find them in Pokémon GO."
                        : "Tag the ones you plan to use so they're easy to find in your bag.")}
                </span>
              ) : (
                <>
                  <Action primary onClick={() => void copySearch()}>
                    Copy search string
                  </Action>
                  {tab === "transfer" ? (
                    <Action onClick={() => void keep([...selected], KEEP_TAG)}>Keep these</Action>
                  ) : tab === "pvp" ? (
                    <Action onClick={() => void keep([...selected], "PvP")}>Tag #PvP</Action>
                  ) : tab === "evolve" ? (
                    <Action onClick={() => void keep([...selected], "Evolve")}>Tag #Evolve</Action>
                  ) : (
                    <Action onClick={() => void keep([...selected], "Raid")}>Tag #Raid</Action>
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

          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-4 sm:px-8 py-8 text-sm text-ink-400">
                {tab === "transfer"
                  ? "Nothing to transfer right now. Every Pokémon is either your best of its species or has a reason to stay."
                  : tab === "evolve"
                    ? "No evolutions to suggest right now."
                    : tab === "power"
                      ? "None of your Pokémon have a charged move that makes them a raid attacker yet."
                      : "None of your appraised Pokémon rank in the top 100 for a league where their species is competitive."}
              </p>
            ) : tab === "transfer" ? (
              <TransferTable
                list={recs.transfer}
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
            ) : tab === "evolve" ? (
              <EvolveTable list={evolve} selected={selected} onToggle={toggle} />
            ) : tab === "power" ? (
              <PowerTable groups={power} data={data} selected={selected} onToggle={toggle} />
            ) : (
              <PvpTable
                list={pvpList}
                league={league}
                selected={selected}
                onToggle={toggle}
              />
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
          <th className="w-10 sm:w-12" />
          <th className="w-11 sm:w-14" />
          <th className="w-16 px-2 py-2 text-right font-semibold sm:w-24 sm:px-3">CP</th>
          <th className="px-2 py-2 font-semibold sm:px-3 md:w-36">IVs</th>
          <th className="hidden px-3 py-2 font-semibold md:table-cell">Why it can go</th>
          <th className="w-20 sm:w-28" />
        </tr>
      </thead>
      {groups.map(({ keeper, items }) => {
        const ids = items.map((a) => a.row.id);
        const all = ids.every((id) => selected.has(id));
        return (
          <tbody key={keeper.id}>
            <tr className="border-b border-ink-800 bg-ink-900/70">
              <td className="pl-3 sm:pl-8">
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
              {/* Spans only columns that exist at every screen size; a span past the last
                  visible column would add phantom columns on phones. */}
              <td colSpan={3} className="px-2 py-2 sm:px-3">
                <span className="font-display text-base font-bold">{keeper.sp.name}</span>
                <span className="block text-ink-300 sm:ml-3 sm:inline">
                  Keeping your {keeper.cp.toLocaleString()} CP {keeper.sp.name} with {keeper.ivPct}% IVs ({keeper.iv!.join("/")})
                </span>
                <span className="mt-1 inline-block rounded-full bg-ink-800 px-2 py-0.5 text-xs text-ink-300 sm:mt-0 sm:ml-3">
                  {items.length} to transfer
                </span>
              </td>
            </tr>
            {items.map((a) => (
              <SelectableRow key={a.row.id} a={a} selected={selected} onToggle={onToggle} sprite={false}>
                <td className="px-2 text-right font-display font-semibold tabular-nums sm:px-3">
                  {a.row.cp.toLocaleString()}
                </td>
                <td className="px-2 py-2 tabular-nums sm:px-3">
                  {a.row.ivPct}% <span className="text-xs text-ink-400">{a.row.iv!.join("/")}</span>
                  {a.leagueNote && <span className="block text-xs text-ink-400 md:hidden">{a.leagueNote}</span>}
                </td>
                <td className="hidden px-3 py-2 leading-snug text-ink-300 md:table-cell">
                  {a.dominated ? "Your keeper's IVs are equal or better in every stat." : "Your keeper has better IVs overall."}
                  {a.leagueNote && <span className="text-ink-400"> {a.leagueNote}.</span>}
                  {a.row.nickname && <span className="text-ink-400"> “{a.row.nickname}”</span>}
                </td>
                <td className="px-2 text-right sm:px-3">
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
          <th className="w-10 sm:w-12" />
          <th className="w-11 sm:w-14" />
          <th className="w-28 px-2 py-2 font-semibold sm:w-52 sm:px-3">Pokémon</th>
          <th className="hidden w-20 px-3 py-2 text-right font-semibold md:table-cell">CP</th>
          <th className="hidden w-24 px-3 py-2 font-semibold md:table-cell">IVs</th>
          <th className="px-2 py-2 font-semibold sm:px-3">League value</th>
        </tr>
      </thead>
      <tbody>
        {list.map((a) => {
          const picks = a.pvp.filter((p) => p.rank <= GOOD_IV_RANK && (league === "all" || p.league === league));
          return (
            <SelectableRow key={a.row.id} a={a} selected={selected} onToggle={onToggle}>
              <td className="px-2 sm:px-3">
                <span className="font-semibold">{a.row.sp.name}</span>
                <span className="block text-xs text-ink-400 tabular-nums md:hidden">
                  {a.row.cp.toLocaleString()} CP · {a.row.iv!.join("/")}
                </span>
                {a.row.variant === "shadow" && (
                  <span className="ml-1.5 rounded bg-violet-400/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-200">
                    Shadow
                  </span>
                )}
                {a.row.tags?.includes("PvP") && <span className="ml-1.5 text-xs text-ink-400">#PvP</span>}
              </td>
              <td className="hidden px-3 text-right font-display font-semibold tabular-nums md:table-cell">
                {a.row.cp.toLocaleString()}
              </td>
              <td className="hidden px-3 text-xs text-ink-300 tabular-nums md:table-cell">{a.row.iv!.join(" / ")}</td>
              <td className="space-y-2 px-2 py-2 sm:space-y-1 sm:px-3">
                {picks.map((p) => (
                  <div
                    key={`${p.league}-${p.target.id}`}
                    className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 sm:grid-cols-[96px_52px_52px_1fr] sm:gap-x-3"
                  >
                    <span className={`text-xs font-semibold ${p.league === "gl" ? "text-sky-300" : "text-amber-200"}`}>
                      {LEAGUES[p.league].name}
                    </span>
                    <span className="font-display font-bold text-glow-300 tabular-nums">
                      #{p.rank}
                      <span className="ml-2 font-sans text-xs font-normal text-ink-400 sm:hidden">{p.pct}%</span>
                    </span>
                    <span className="hidden text-xs text-ink-400 tabular-nums sm:inline">{p.pct}%</span>
                    <span className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
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
  a: { row: Row };
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
      <td className="pl-3 sm:pl-8">
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

function reasonText(r: EvolveReason, s: EvolveSuggestion): ReactNode {
  if (r.kind === "league") {
    return (
      <>
        <span className={`font-semibold ${r.pick.league === "gl" ? "text-sky-300" : "text-amber-200"}`}>
          {LEAGUES[r.pick.league].name} #{r.pick.rank}
        </span>{" "}
        as {r.pick.target.name}
        {r.pick.target.id !== s.target.id && " (evolve again)"}, level {r.pick.level}
      </>
    );
  }
  if (r.kind === "raid") {
    return (
      <>
        <span className="font-semibold text-glow-300">#{r.rank}</span> <TypeBadge type={r.type} /> raid attacker
        {s.row.variant === "shadow" ? " among Shadows" : ""}
      </>
    );
  }
  return <span className="text-ink-300">New Pokédex entry</span>;
}

function EvolveTable({
  list,
  selected,
  onToggle,
}: {
  list: EvolveSuggestion[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
}) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead className="sticky top-0 z-10 bg-ink-950 text-xs text-ink-400">
        <tr className="border-b border-ink-800 text-left">
          <th className="w-10 sm:w-12" />
          <th className="w-11 sm:w-14" />
          <th className="px-2 py-2 font-semibold sm:px-3 md:w-52">Pokémon</th>
          <th className="hidden w-56 px-3 py-2 font-semibold md:table-cell">Evolve to</th>
          <th className="hidden w-64 px-3 py-2 font-semibold md:table-cell">Cost</th>
          <th className="hidden px-3 py-2 font-semibold md:table-cell">Why</th>
        </tr>
      </thead>
      <tbody>
        {list.map((e) => {
          const reqs = requirements(e.path);
          return (
            <SelectableRow key={`${e.row.id}>${e.target.id}`} a={e} selected={selected} onToggle={onToggle}>
              <td className="px-2 py-2 sm:px-3">
                <span className="font-semibold">{e.row.sp.name}</span>
                {e.row.variant === "shadow" && <ShadowBadge />}
                <span className="block text-xs text-ink-400 tabular-nums">
                  {e.row.cp.toLocaleString()} CP{e.row.iv ? ` · ${e.row.iv.join("/")}` : " · not appraised"}
                </span>
                <span className="mt-1.5 block md:hidden">
                  → <span className="font-semibold">{e.target.name}</span>
                  <span className="ml-2 text-xs text-ink-400">
                    {e.candy} candy{reqs.length ? ` · ${reqs.join(" · ")}` : ""}
                  </span>
                </span>
                <span className="mt-1 block space-y-0.5 text-xs md:hidden">
                  {e.reasons.map((r, i) => (
                    <span key={i} className="block">
                      {reasonText(r, e)}
                    </span>
                  ))}
                </span>
              </td>
              <td className="hidden px-3 md:table-cell">
                <span className="flex items-center gap-1">
                  <PokemonImage species={e.target} style="pixel" size={36} shiny={e.row.shiny} />
                  <span className="min-w-0">
                    <span className="font-semibold">{e.target.name}</span>
                    {e.path.length > 1 && (
                      <span className="block truncate text-xs text-ink-400">
                        via {e.path.slice(0, -1).map((st) => st.to.name).join(", ")}
                      </span>
                    )}
                  </span>
                </span>
              </td>
              <td className="hidden px-3 py-2 text-xs leading-snug text-ink-300 md:table-cell">
                <span className="font-display text-sm font-semibold text-ink-100 tabular-nums">{e.candy}</span> candy
                {reqs.map((r) => (
                  <span key={r} className="block text-ink-400">
                    {r}
                  </span>
                ))}
              </td>
              <td className="hidden space-y-0.5 px-3 py-2 md:table-cell">
                {e.reasons.map((r, i) => (
                  <div key={i}>{reasonText(r, e)}</div>
                ))}
              </td>
            </SelectableRow>
          );
        })}
      </tbody>
    </table>
  );
}

function PowerTable({
  groups,
  data,
  selected,
  onToggle,
}: {
  groups: PowerUpGroup[];
  data: GameData;
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
}) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead className="sticky top-0 z-10 bg-ink-950 text-xs text-ink-400">
        <tr className="border-b border-ink-800 text-left">
          <th className="w-10 sm:w-12" />
          <th className="w-11 sm:w-14" />
          <th className="px-2 py-2 font-semibold sm:px-3 md:w-52">Pokémon</th>
          <th className="hidden px-3 py-2 font-semibold lg:table-cell">Moves</th>
          <th className="w-20 px-2 py-2 font-semibold sm:w-36 sm:px-3">At level {RAID_LEVEL}</th>
          <th className="hidden w-72 px-3 py-2 font-semibold md:table-cell">Cost to level {RAID_LEVEL}</th>
        </tr>
      </thead>
      {groups.map((g) => {
        const best = typeRanking(g.type, data)[0];
        return (
          <tbody key={g.type}>
            <tr className="border-b border-ink-800 bg-ink-900/70">
              <td />
              <td colSpan={3} className="px-1 py-2">
                <TypeBadge type={g.type} size="md" />
                <span className="ml-3 text-xs text-ink-400">
                  Best in the game: {best.shadow ? "Shadow " : ""}
                  {best.sp.name}
                </span>
              </td>
            </tr>
            {g.picks.map((p) => (
              <SelectableRow key={`${g.type}|${p.row.id}`} a={p} selected={selected} onToggle={onToggle}>
                <td className="px-2 py-2 sm:px-3">
                  <span className="font-semibold">{p.row.nickname ?? p.row.sp.name}</span>
                  {p.row.variant === "shadow" && <ShadowBadge />}
                  <span className="block text-xs text-ink-400 tabular-nums">
                    {p.row.cp.toLocaleString()} CP · level {p.level}
                    {p.row.iv ? ` · ${p.row.iv.join("/")}` : " · not appraised"}
                  </span>
                  <span className="block text-xs text-ink-300 lg:hidden">
                    {data.moves[p.fast]?.name ?? p.fast} · {data.moves[p.charged]?.name ?? p.charged}
                    {p.assumedMoves && <span className="text-ink-400"> (assumed)</span>}
                  </span>
                  <span className="block text-xs text-ink-400 md:hidden">
                    {p.level >= RAID_LEVEL ? "Already level 40" : describeCost(p.cost)}
                  </span>
                </td>
                <td className="hidden px-3 text-ink-300 lg:table-cell">
                  {data.moves[p.fast]?.name ?? p.fast} <span className="text-ink-600">·</span>{" "}
                  {data.moves[p.charged]?.name ?? p.charged}
                  {p.assumedMoves && <span className="ml-1.5 text-xs text-ink-400">(assumed)</span>}
                </td>
                <td className="px-2 sm:px-3">
                  <span className="font-display font-bold text-glow-300 tabular-nums">{p.pct}%</span>
                  <span className="ml-1.5 hidden text-xs text-ink-400 sm:inline">of the best</span>
                </td>
                <td className="hidden px-3 py-2 text-xs text-ink-300 md:table-cell">
                  {p.level >= RAID_LEVEL ? <span className="text-ink-400">Already there</span> : describeCost(p.cost)}
                  {p.row.lucky && p.level < RAID_LEVEL && <span className="block text-ink-400">Lucky: half stardust</span>}
                </td>
              </SelectableRow>
            ))}
          </tbody>
        );
      })}
    </table>
  );
}

function ShadowBadge() {
  return (
    <span className="ml-1.5 rounded bg-violet-400/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-200">Shadow</span>
  );
}
