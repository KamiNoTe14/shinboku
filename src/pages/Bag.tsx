import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../auth/AuthProvider";
import {
  addPokemon,
  changeTag,
  deletePokemon,
  patchPokemon,
  setFavorite,
  updatePokemon,
  useBag,
  type BagPokemon,
  type PokemonInput,
} from "../lib/bag";
import { useGameData, type Species } from "../lib/go/gamedata";
import { evolve, powerUp, undoChange, type Change } from "../lib/actions";
import { CatchCard } from "./bag/CatchCard";
import { toRows, toSearchable } from "../lib/bagRows";
import { buildSearches, type SearchResult } from "../lib/go/searchString";
import { EntryRow } from "./bag/EntryRow";
import { BagTable, type Row, type SortKey } from "./bag/BagTable";
import { ImportDialog } from "./bag/ImportDialog";
import { SearchStringPanel } from "../components/SearchStringPanel";
import { bagToCsv } from "../lib/bagCsv";

type Filter = "shiny" | "lucky" | "shadow" | "purified" | "favorite" | "hundo" | "unappraised";

const FILTERS: { key: Filter; label: string; test: (r: Row) => boolean }[] = [
  { key: "favorite", label: "Favorites", test: (r) => !!r.favorite },
  { key: "shiny", label: "Shiny", test: (r) => !!r.shiny },
  { key: "lucky", label: "Lucky", test: (r) => !!r.lucky },
  { key: "shadow", label: "Shadow", test: (r) => r.variant === "shadow" },
  { key: "purified", label: "Purified", test: (r) => r.variant === "purified" },
  { key: "hundo", label: "100%", test: (r) => r.ivPct === 100 },
  { key: "unappraised", label: "Not appraised", test: (r) => !r.iv },
];

export default function Bag() {
  const { user } = useAuth();
  const { data, error: dataError } = useGameData();
  const bag = useBag();
  const [params] = useSearchParams();
  const initialSpecies = (data && params.get("species") && data.byId.get(params.get("species")!)) || null;

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "added",
    desc: true,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [editing, setEditing] = useState<BagPokemon | null>(null);
  const [searches, setSearches] = useState<SearchResult[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  // On touch screens there's no shift or ctrl, so "Select" turns taps into toggles.
  const [selectMode, setSelectMode] = useState(false);
  const [history, setHistory] = useState<{ id: string; undo: Change; label: string }[]>([]);

  const allRows = useMemo<Row[]>(() => (data ? toRows(bag.pokemon, data) : []), [bag.pokemon, data]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRows) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [allRows]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = FILTERS.filter((f) => filters.has(f.key));
    const filtered = allRows.filter(
      (r) =>
        active.every((f) => f.test(r)) &&
        (!tagFilter || r.tags?.includes(tagFilter)) &&
        (!q ||
          r.sp.name.toLowerCase().includes(q) ||
          r.nickname?.toLowerCase().includes(q) ||
          r.tags?.some((t) => t.toLowerCase().includes(q)) ||
          String(r.sp.dex) === q.replace(/^#/, "")),
    );
    const val = (r: Row): number | string => {
      switch (sort.key) {
        case "added":
          return r.added;
        case "name":
          return r.sp.name;
        case "cp":
          return r.cp;
        case "iv":
          return r.ivPct ?? -1;
        case "level":
          return r.level ?? -1;
        case "caught":
          return r.caught ?? "";
      }
    };
    return filtered.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return (sort.desc ? -c : c) || b.added - a.added;
    });
  }, [allRows, query, filters, tagFilter, sort]);

  // Forget selected Pokémon that no longer exist (deleted elsewhere).
  useEffect(() => {
    const ids = new Set(allRows.map((r) => r.id));
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [allRows]);

  useEffect(() => {
    setSearches(null);
    setConfirmDelete(false);
  }, [selected]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  // The catch card follows a single selection, even if a change (like evolving) moves it out of the current filter.
  const cardRow = useMemo(
    () => (selected.size === 1 && !selectMode ? (allRows.find((r) => selected.has(r.id)) ?? null) : null),
    [allRows, selected, selectMode],
  );

  // Writes show up in the bag straight away from the local cache, so this doesn't wait for the
  // server (which would also hang while offline).
  const apply = (row: Row, change: Change, label: string) => {
    if (!user) return;
    patchPokemon(user.uid, row.id, change).catch((err: Error) => setNotice(`Couldn't save that change: ${err.message}`));
    setHistory((h) => [...h.slice(-19), { id: row.id, undo: undoChange(row, change), label }]);
    setNotice(label);
  };

  const doPowerUp = (row: Row, to?: number) => {
    if (!data) return;
    try {
      const change = powerUp(row, row.sp, data, to);
      apply(
        row,
        change,
        `Powered up ${row.nickname ?? row.sp.name} to level ${change.level} (${Number(change.cp).toLocaleString()} CP).`,
      );
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  const doEvolve = (row: Row, target: Species, newCp?: number) => {
    try {
      const change = evolve(row, row.sp, target, newCp);
      apply(
        row,
        change,
        `Evolved ${row.nickname ?? row.sp.name} into ${target.name} (${Number(change.cp).toLocaleString()} CP).`,
      );
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  const undo = async () => {
    const last = history[history.length - 1];
    if (!user || !last) return;
    setHistory((h) => h.slice(0, -1));
    await patchPokemon(user.uid, last.id, last.undo);
    setNotice(`Undid: ${last.label.replace(/\.$/, "")}`);
  };

  const onSelect = useCallback(
    (id: string, mode: "only" | "toggle" | "range") => {
      if (mode === "range" && anchor) {
        const a = rows.findIndex((r) => r.id === anchor);
        const b = rows.findIndex((r) => r.id === id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelected(new Set(rows.slice(lo, hi + 1).map((r) => r.id)));
          return;
        }
      }
      if (mode === "toggle") {
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else {
        setSelected(new Set([id]));
      }
      setAnchor(id);
    },
    [anchor, rows],
  );

  const save = async (input: PokemonInput) => {
    if (!user) return;
    if (editing) {
      await updatePokemon(user.uid, editing, input);
      setEditing(null);
    } else {
      await addPokemon(user.uid, input);
    }
  };

  const openSearches = async () => {
    if (!selectedRows.length) return;
    const results = buildSearches(selectedRows.map(toSearchable), allRows.map(toSearchable));
    setSearches(results);
    if (results.length === 1) await copy(results[0].query);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied. Paste it into the search bar on Pokémon GO's Pokémon screen.");
    } catch {
      setNotice("Couldn't copy automatically. Select the text and copy it.");
    }
  };

  const exportBag = () => {
    const blob = new Blob([bagToCsv(allRows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shinboku-bag-${new Date().toLocaleDateString("en-CA")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Downloaded a backup of ${allRows.length.toLocaleString()} Pokémon.`);
  };

  const doDelete = async () => {
    if (!user) return;
    const n = selected.size;
    await deletePokemon(user.uid, [...selected]);
    setSelected(new Set());
    setConfirmDelete(false);
    setNotice(`Deleted ${n} Pokémon.`);
  };

  const onKeyCommand = (e: KeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(new Set(rows.map((r) => r.id)));
    } else if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      void openSearches();
    } else if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      void undo();
    } else if (!mod && e.key.toLowerCase() === "p" && cardRow) {
      e.preventDefault();
      doPowerUp(cardRow);
    } else if (e.key === "Escape") {
      setSelected(new Set());
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
      e.preventDefault();
      setConfirmDelete(true);
    } else if ((e.key === "Enter" || e.key.toLowerCase() === "e") && selectedRows.length === 1) {
      e.preventDefault();
      setEditing(selectedRows[0]);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = rows.findIndex((r) => r.id === anchor);
      const j = e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
      const target = rows[i === -1 ? 0 : j];
      if (!target) return;
      if (e.shiftKey && anchor) {
        setSelected((s) => new Set([...s, target.id]));
        setAnchor(target.id);
      } else {
        setSelected(new Set([target.id]));
        setAnchor(target.id);
      }
    }
  };

  const toggleFilter = (f: Filter) =>
    setFilters((s) => {
      const next = new Set(s);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  if (dataError) return <p className="px-4 sm:px-8 py-8 text-rose-300">{dataError}. Refresh the page to try again.</p>;
  if (!data) return <p className="px-4 sm:px-8 py-8 text-sm text-ink-400">Loading…</p>;

  const allFavorite = selectedRows.length > 0 && selectedRows.every((r) => r.favorite);

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <PageHeader
        title="Bag"
        subtitle={
          bag.loading
            ? "Loading your bag…"
            : `${allRows.length.toLocaleString()} Pokémon logged${rows.length !== allRows.length ? `, ${rows.length.toLocaleString()} shown` : ""}`
        }
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, nickname or tag"
              className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 sm:w-72 sm:flex-none text-sm placeholder:text-ink-400 focus:border-glow-500 focus:outline-none"
              aria-label="Search your bag"
            />
            <button
              onClick={() => setImporting(true)}
              className="rounded-lg border border-ink-700 px-3 py-2 text-sm font-semibold hover:bg-ink-800"
            >
              Import
            </button>
            <button
              onClick={exportBag}
              disabled={allRows.length === 0}
              title="Download your whole bag as a CSV file you can open in Excel or Google Sheets"
              className="rounded-lg border border-ink-700 px-3 py-2 text-sm font-semibold hover:bg-ink-800 disabled:opacity-40"
            >
              Export
            </button>
          </div>
        }
      />

      {importing && user && (
        <ImportDialog
          uid={user.uid}
          data={data}
          existingIds={new Set(allRows.map((r) => r.id))}
          onClose={() => setImporting(false)}
          onDone={(msg) => {
            setImporting(false);
            setNotice(msg);
          }}
        />
      )}

      <EntryRow data={data} initialSpecies={initialSpecies} editing={editing} onSave={save} onCancelEdit={() => setEditing(null)} />

      {bag.error && (
        <div className="mx-4 sm:mx-8 mt-4 rounded-lg border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {bag.error} Publish the latest <code>firestore.rules</code> in the Firebase console under Firestore, then
          Rules.
        </div>
      )}

      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-ink-800 px-4 py-2.5 sm:flex-wrap sm:px-8 [&>*]:shrink-0">
        {FILTERS.map((f) => (
          <Chip key={f.key} on={filters.has(f.key)} onClick={() => toggleFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
        {allTags.length > 0 && <span className="mx-2 h-4 w-px bg-ink-700" aria-hidden="true" />}
        {allTags.slice(0, 12).map((t) => (
          <Chip key={t} on={tagFilter === t} onClick={() => setTagFilter((cur) => (cur === t ? null : t))}>
            #{t}
          </Chip>
        ))}
      </div>

      {/* The action bar keeps a fixed slot so the table never shifts under the cursor
          when a selection starts or ends. The search-string panel floats over the table. */}
      <div className="relative">
        <div
          className={`no-scrollbar flex h-12 items-center gap-2 overflow-x-auto border-b px-4 text-sm whitespace-nowrap sm:px-8 [&>*]:shrink-0 ${
            selected.size > 0 ? "border-glow-500/30 bg-glow-500/[0.07]" : "border-ink-800"
          }`}
        >
          {selected.size === 0 ? (
            <>
              <span className="truncate text-ink-400 lg:hidden">{notice ?? "Tap a Pokémon to open its card."}</span>
              <span className="hidden text-ink-400 lg:inline">
                {notice ??
                  "Click a Pokémon to open its card. Shift-click selects a range, Ctrl-click adds or removes one."}
              </span>
              <span className="ml-auto lg:hidden">
                <ActionButton onClick={() => setSelectMode(true)}>Select</ActionButton>
              </span>
            </>
          ) : (
            <>
              <span className="mr-2 font-semibold text-glow-300">{selected.size.toLocaleString()} selected</span>
              {!selectMode && (
                <span className="lg:hidden">
                  <ActionButton onClick={() => setSelectMode(true)}>Select more</ActionButton>
                </span>
              )}
              <ActionButton onClick={() => void openSearches()} primary>
                Copy search string
              </ActionButton>
              {selectedRows.length === 1 && (
                <ActionButton onClick={() => setEditing(selectedRows[0])}>Edit</ActionButton>
              )}
              <ActionButton onClick={() => user && void setFavorite(user.uid, [...selected], !allFavorite)}>
                {allFavorite ? "Unfavorite" : "Favorite"}
              </ActionButton>
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = tagInput.trim();
                  if (!t || !user) return;
                  void changeTag(user.uid, [...selected], t, true);
                  setTagInput("");
                  setNotice(`Tagged ${selected.size} Pokémon with “${t}”.`);
                }}
              >
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag"
                  className="w-32 rounded-md border border-ink-700 bg-ink-950 px-2 py-1 text-sm placeholder:text-ink-400 focus:border-glow-500 focus:outline-none"
                  aria-label="Tag to add to the selected Pokémon"
                />
              </form>
              {tagFilter && (
                <ActionButton onClick={() => user && void changeTag(user.uid, [...selected], tagFilter, false)}>
                  Remove #{tagFilter}
                </ActionButton>
              )}
              <span className="min-w-0 flex-1 truncate text-glow-300">
                {notice}
                {notice && history.length > 0 && notice === history[history.length - 1].label && (
                  <button
                    onClick={() => void undo()}
                    className="ml-2 font-semibold text-ink-100 underline hover:text-white"
                  >
                    Undo
                  </button>
                )}
              </span>
              {confirmDelete ? (
                <span className="flex items-center gap-2">
                  <span className="text-rose-200">
                    Delete {selected.size.toLocaleString()} Pokémon from Shinboku? This can't be undone.
                  </span>
                  <ActionButton onClick={() => void doDelete()} danger>
                    Delete
                  </ActionButton>
                  <ActionButton onClick={() => setConfirmDelete(false)}>Keep them</ActionButton>
                </span>
              ) : (
                <ActionButton onClick={() => setConfirmDelete(true)} danger>
                  Delete
                </ActionButton>
              )}
              <ActionButton
                onClick={() => {
                  setSelected(new Set());
                  setSelectMode(false);
                }}
              >
                {selectMode ? "Done" : "Clear"}
              </ActionButton>
            </>
          )}
        </div>

        {searches && (
          <SearchStringPanel results={searches} onClose={() => setSearches(null)} onCopy={(q) => void copy(q)} />
        )}
      </div>

      {!bag.loading && allRows.length === 0 && !bag.error ? (
        <div className="mx-4 sm:mx-8 mt-8 max-w-2xl">
          <h2 className="text-lg font-bold">Your bag is empty</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">
            Add your first Pokémon in the row above. Start typing a species, press <kbd>Tab</kbd> to move through CP, HP
            and the appraisal, then <kbd>Enter</kbd> to add it. The species stays selected, so the next one of the same
            kind only needs new numbers.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-300">
            Have a Shinboku backup or a spreadsheet of your Pokémon?{" "}
            <button onClick={() => setImporting(true)} className="text-glow-400 hover:text-glow-300">
              Import it
            </button>
            .
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-300">
            Tip: in Pokémon GO, searching <code className="text-glow-300">age0</code> shows today's catches, which makes
            daily updates quick. Not sure what something is? Look it up in the{" "}
            <Link to="/pokedex" className="text-glow-400 hover:text-glow-300">
              Pokédex
            </Link>
            .
          </p>
        </div>
      ) : rows.length === 0 && allRows.length > 0 ? (
        <p className="px-4 sm:px-8 py-8 text-sm text-ink-400">
          No Pokémon match these filters.{" "}
          <button
            className="text-glow-400 hover:text-glow-300"
            onClick={() => {
              setQuery("");
              setFilters(new Set());
              setTagFilter(null);
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <div className="flex min-h-[75vh] flex-1 lg:min-h-0">
          <BagTable
            rows={rows}
            data={data}
            selected={selected}
            onSelect={(id, mode) => onSelect(id, selectMode && mode === "only" ? "toggle" : mode)}
            onEdit={setEditing}
            onKeyCommand={onKeyCommand}
            sort={sort}
            onSort={(key) =>
              setSort((s) => ({
                key,
                desc: s.key === key ? !s.desc : key !== "name",
              }))
            }
          />
          {cardRow && (
            <CatchCard
              key={cardRow.id}
            row={cardRow}
            onKeyDown={onKeyCommand}
              data={data}
                onPowerUp={(to) => doPowerUp(cardRow, to)}
              onEvolve={(target, cp) => doEvolve(cardRow, target, cp)}
              onEdit={() => {
              setEditing(cardRow);
              // On phones the card covers the page, so close it to show the form.
              if (!window.matchMedia("(min-width: 1024px)").matches) {
                setSelected(new Set());
                document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
              onFavorite={() => user && void setFavorite(user.uid, [cardRow.id], !cardRow.favorite)}
              onClose={() => setSelected(new Set())}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
        on
          ? "border-glow-500/60 bg-glow-500/15 text-glow-300"
          : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  onClick,
  children,
  primary,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
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
