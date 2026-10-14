import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../auth/AuthProvider";
import {
  addPokemon,
  changeTag,
  deletePokemon,
  setFavorite,
  updatePokemon,
  useBag,
  type BagPokemon,
  type PokemonInput,
} from "../lib/bag";
import { useGameData } from "../lib/go/gamedata";
import { ivPercent } from "../lib/go/stats";
import { buildSearches, type SearchResult } from "../lib/go/searchString";
import { EntryRow } from "./bag/EntryRow";
import { BagTable, type Row, type SortKey } from "./bag/BagTable";

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

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "added", desc: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [editing, setEditing] = useState<BagPokemon | null>(null);
  const [searches, setSearches] = useState<SearchResult[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const allRows = useMemo<Row[]>(() => {
    if (!data) return [];
    return bag.pokemon.flatMap((p) => {
      const sp = data.byId.get(p.species);
      if (!sp) return [];
      return [{ ...p, sp, ivPct: p.iv ? ivPercent({ atk: p.iv[0], def: p.iv[1], sta: p.iv[2] }) : null }];
    });
  }, [bag.pokemon, data]);

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
        case "added": return r.added;
        case "name": return r.sp.name;
        case "cp": return r.cp;
        case "iv": return r.ivPct ?? -1;
        case "level": return r.level ?? -1;
        case "caught": return r.caught ?? "";
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
    const toSearchable = (r: Row) => ({ id: r.id, dex: r.sp.dex, cp: r.cp, hp: r.hp, shiny: r.shiny, lucky: r.lucky, variant: r.variant });
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

  const doDelete = async () => {
    if (!user) return;
    const n = selected.size;
    await deletePokemon(user.uid, [...selected]);
    setSelected(new Set());
    setConfirmDelete(false);
    setNotice(`Deleted ${n} Pokémon.`);
  };

  const onKeyCommand = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(new Set(rows.map((r) => r.id)));
    } else if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      void openSearches();
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

  if (dataError) return <p className="px-8 py-8 text-rose-300">{dataError}. Refresh the page to try again.</p>;
  if (!data) return <p className="px-8 py-8 text-sm text-ink-400">Loading…</p>;

  const allFavorite = selectedRows.length > 0 && selectedRows.every((r) => r.favorite);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Bag"
        subtitle={
          bag.loading
            ? "Loading your bag…"
            : `${allRows.length.toLocaleString()} Pokémon logged${rows.length !== allRows.length ? `, ${rows.length.toLocaleString()} shown` : ""}`
        }
        actions={
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, nickname or tag"
            className="w-72 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm placeholder:text-ink-400 focus:border-glow-500 focus:outline-none"
            aria-label="Search your bag"
          />
        }
      />

      <EntryRow data={data} editing={editing} onSave={save} onCancelEdit={() => setEditing(null)} />

      {bag.error && (
        <div className="mx-8 mt-4 rounded-lg border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {bag.error} Publish the latest <code>firestore.rules</code> in the Firebase console under Firestore,
          then Rules.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-800 px-8 py-2.5">
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
          className={`flex h-12 items-center gap-2 border-b px-8 text-sm ${
            selected.size > 0 ? "border-glow-500/30 bg-glow-500/[0.07]" : "border-ink-800"
          }`}
        >
          {selected.size === 0 ? (
            <span className="text-ink-400">
              {notice ?? "Click a Pokémon to select it. Shift-click selects a range, Ctrl-click adds or removes one. Double-click to edit."}
            </span>
          ) : (
            <>
              <span className="mr-2 font-semibold text-glow-300">{selected.size.toLocaleString()} selected</span>
              <ActionButton onClick={() => void openSearches()} primary>
                Copy search string
              </ActionButton>
              {selectedRows.length === 1 && <ActionButton onClick={() => setEditing(selectedRows[0])}>Edit</ActionButton>}
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
              <span className="min-w-0 flex-1 truncate text-glow-300">{notice}</span>
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
              <ActionButton onClick={() => setSelected(new Set())}>Clear</ActionButton>
            </>
          )}
        </div>

        {searches && (
          <div className="absolute inset-x-8 top-full z-20 mt-2 rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between gap-4">
              <p className="text-ink-300">
                {searches.length === 1
                  ? "Paste this into the search bar on Pokémon GO's Pokémon screen to pull up your selection:"
                  : `Your selection is split into ${searches.length} searches to keep each one short. Copy them one at a time:`}
              </p>
              <button onClick={() => setSearches(null)} className="text-ink-400 hover:text-ink-100" aria-label="Close">
                Close
              </button>
            </div>
            <ul className="mt-3 space-y-1.5">
              {searches.map((sr, i) => (
                <li key={i} className="flex items-center gap-3">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-glow-300">
                    {sr.query}
                  </code>
                  <span className="w-60 shrink-0 text-xs text-ink-400">
                    Finds {sr.count} selected
                    {sr.extras > 0
                      ? `, plus ${sr.extras} other${sr.extras === 1 ? "" : "s"} with the same species and CP`
                      : ""}
                  </span>
                  <ActionButton onClick={() => void copy(sr.query)}>Copy</ActionButton>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!bag.loading && allRows.length === 0 && !bag.error ? (
        <div className="mx-8 mt-8 max-w-2xl">
          <h2 className="text-lg font-bold">Your bag is empty</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">
            Add your first Pokémon in the row above. Start typing a species, press <kbd>Tab</kbd> to move through
            CP, HP and the appraisal, then <kbd>Enter</kbd> to add it. The species stays selected, so the next
            one of the same kind only needs new numbers.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-300">
            Tip: in Pokémon GO, searching <code className="text-glow-300">age0</code> shows today's catches, which
            makes daily updates quick. Not sure what something is? Look it up in the{" "}
            <Link to="/pokedex" className="text-glow-400 hover:text-glow-300">
              Pokédex
            </Link>
            .
          </p>
        </div>
      ) : rows.length === 0 && allRows.length > 0 ? (
        <p className="px-8 py-8 text-sm text-ink-400">
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
        <BagTable
          rows={rows}
          data={data}
          selected={selected}
          onSelect={onSelect}
          onEdit={setEditing}
          onKeyCommand={onKeyCommand}
          sort={sort}
          onSort={(key) =>
            setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "name" }))
          }
        />
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
        on ? "border-glow-500/60 bg-glow-500/15 text-glow-300" : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100"
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
