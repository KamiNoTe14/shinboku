// Batch entry: a spreadsheet-style grid that knows every species and moveset.
// Log a run of Pokémon in one pass while swiping on your phone, then add them
// all to the bag at once. Appraisals come later on the Catch up page.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { Combobox, type Option } from "../components/Combobox";
import { PageHeader } from "../components/PageHeader";
import { PokemonImage } from "../components/PokemonImage";
import { TypeBadge } from "../components/TypeBadge";
import { importPokemon, useBag } from "../lib/bag";
import {
  blankRow,
  checkDraft,
  flagLabels,
  parseFlags,
  suggestMoves,
  toInput,
  type DraftCheck,
  type DraftRow,
} from "../lib/batch";
import { useGameData, type GameData, type Species } from "../lib/go/gamedata";
import { Key, readStoredDate, today } from "./bag/EntryRow";

const STORAGE_KEY = "batch.v1";

function loadDraft(): DraftRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const rows = raw ? (JSON.parse(raw) as DraftRow[]) : [];
    if (Array.isArray(rows) && rows.length) return rows;
  } catch {}
  return [blankRow({ tags: "", caught: readStoredDate() })];
}

// Column layout shared by the header and every row.
const GRID =
  "grid grid-cols-[28px_minmax(170px,2fr)_76px_64px_minmax(140px,1.5fr)_minmax(140px,1.5fr)_minmax(140px,1.5fr)_72px_minmax(110px,1fr)_136px_28px] items-center gap-1.5";

const COLS = ["species", "cp", "hp", "fast", "charged", "charged2", "flags", "tags", "caught"] as const;
type Col = (typeof COLS)[number];

export default function BatchEntry() {
  const { data, error } = useGameData();
  if (error) return <p className="px-4 py-8 text-rose-300 sm:px-8">{error}. Refresh the page to try again.</p>;
  if (!data) return <p className="px-4 py-8 text-sm text-ink-400 sm:px-8">Loading…</p>;
  return <Grid data={data} />;
}

function Grid({ data }: { data: GameData }) {
  const { user } = useAuth();
  const bag = useBag();
  const [rows, setRows] = useState<DraftRow[]>(loadDraft);
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const grid = useRef<HTMLDivElement>(null);

  // Keep the draft in this browser so a refresh or a closed tab loses nothing.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {}
  }, [rows]);

  const checks = useMemo(() => {
    const m = new Map<string, DraftCheck>();
    for (const r of rows) m.set(r.key, checkDraft(r, data));
    return m;
  }, [rows, data]);
  const ready = rows.filter((r) => checks.get(r.key)?.status === "ok");
  const broken = rows.filter((r) => checks.get(r.key)?.status === "error");

  const speciesOptions = useMemo<Option[]>(
    () =>
      data.species
        .filter((s) => !s.mega)
        .map((s) => ({
          value: s.id,
          label: s.name,
          keywords: String(s.dex),
          render: (
            <>
              <PokemonImage species={s} style="pixel" size={28} />
              <span className="flex-1">{s.name}</span>
              <span className="font-display text-xs text-ink-400">#{s.dex}</span>
            </>
          ),
        })),
    [data],
  );

  const moveCache = useRef(new Map<string, Option[]>());
  const moveOptions = useCallback(
    (sp: Species | undefined, kind: "fast" | "charged"): Option[] => {
      if (!sp) return [];
      const k = `${sp.id}|${kind}`;
      let opts = moveCache.current.get(k);
      if (!opts) {
        opts = sp[kind].map((id) => {
          const m = data.moves[id];
          const tag = sp.elite?.includes(id) ? "Elite TM" : sp.legacy?.includes(id) ? "Legacy" : null;
          return {
            value: id,
            label: m?.name ?? id,
            render: (
              <>
                {m && <TypeBadge type={m.type} />}
                <span className="flex-1">{m?.name ?? id}</span>
                {tag && <span className="text-[11px] text-ice-400">{tag}</span>}
              </>
            ),
          };
        });
        moveCache.current.set(k, opts);
      }
      return opts;
    },
    [data],
  );

  const update = (key: string, patch: Partial<DraftRow>) =>
    setRows((rs) =>
      rs.map((r, i) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.species !== undefined && patch.species !== r.species) {
          const sp = patch.species ? data.byId.get(patch.species) : undefined;
          // Drop moves the new species can't learn, then fill in the usual moveset.
          if (next.fast && !sp?.fast.includes(next.fast)) next.fast = null;
          if (next.charged && !sp?.charged.includes(next.charged)) next.charged = null;
          if (next.charged2 && !sp?.charged.includes(next.charged2)) next.charged2 = null;
          if (sp && !next.fast && !next.charged) {
            const s = suggestMoves(sp.id, rs.slice(0, i), bag.pokemon);
            next.fast = s?.fast ?? (sp.fast.length === 1 ? sp.fast[0] : null);
            next.charged = s?.charged ?? (sp.charged.length === 1 ? sp.charged[0] : null);
          }
        }
        return next;
      }),
    );

  const focusCell = (rowKey: string, col: Col) =>
    setTimeout(() => {
      grid.current?.querySelector<HTMLInputElement>(`[data-row="${rowKey}"][data-col="${col}"]`)?.focus();
    }, 0);

  const addRowAfter = (index: number) => {
    const prev = rows[index];
    const row = blankRow({ tags: prev?.tags ?? "", caught: prev?.caught ?? today() });
    setRows((rs) => [...rs.slice(0, index + 1), row, ...rs.slice(index + 1)]);
    focusCell(row.key, "species");
  };

  const removeRow = (key: string) => {
    setRows((rs) => {
      const next = rs.filter((r) => r.key !== key);
      return next.length ? next : [blankRow({ tags: "", caught: readStoredDate() })];
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const rowKey = el.dataset.row;
    const col = el.dataset.col as Col | undefined;
    if (!rowKey || !col || e.defaultPrevented) return;
    const index = rows.findIndex((r) => r.key === rowKey);
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === "Enter" && mod) {
      e.preventDefault();
      void saveAll();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const next = rows[index + 1];
      if (next) focusCell(next.key, "species");
      else addRowAfter(index);
    } else if (mod && e.key.toLowerCase() === "d" && index > 0) {
      // Same as the row above, except the numbers.
      e.preventDefault();
      const above = rows[index - 1];
      update(rowKey, {
        species: above.species,
        fast: above.fast,
        charged: above.charged,
        charged2: above.charged2,
        flags: above.flags,
        tags: above.tags,
        caught: above.caught,
      });
      focusCell(rowKey, "cp");
    } else if (mod && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      const target = rows[index + 1] ?? rows[index - 1];
      removeRow(rowKey);
      if (target) focusCell(target.key, col);
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && el.getAttribute("role") !== "combobox") {
      const target = rows[index + (e.key === "ArrowDown" ? 1 : -1)];
      if (target) {
        e.preventDefault();
        focusCell(target.key, col);
      }
    }
  };

  async function saveAll() {
    if (!user || saving || !ready.length) return;
    setSaving(true);
    try {
      const items = ready.map((r) => ({ input: toInput(r) }));
      await importPokemon(user.uid, items, "merge");
      const saved = new Set(ready.map((r) => r.key));
      const last = rows[rows.length - 1];
      setRows((rs) => {
        const left = rs.filter((r) => !saved.has(r.key) && checks.get(r.key)?.status !== "empty");
        return left.length ? left : [blankRow({ tags: last?.tags ?? "", caught: last?.caught ?? today() })];
      });
      setNotice(
        <>
          Added {items.length.toLocaleString()} Pokémon to your bag.{" "}
          <Link to="/catch-up?tab=appraise&scope=all" className="font-semibold text-glow-300 underline hover:text-glow-200">
            Appraise them next
          </Link>
        </>,
      );
    } catch (err) {
      setNotice(<span className="text-rose-300">Couldn't save: {(err as Error).message}</span>);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 12000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <PageHeader
        title="Batch entry"
        subtitle="Log a run of Pokémon like a spreadsheet that knows every species and moveset, then add them all at once"
        actions={
          confirmClear ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-rose-200">Clear all {rows.length} rows?</span>
              <button
                onClick={() => {
                  setRows([blankRow({ tags: "", caught: readStoredDate() })]);
                  setConfirmClear(false);
                }}
                className="rounded-md border border-rose-400/40 px-2.5 py-1 font-semibold text-rose-200 hover:bg-rose-400/15"
              >
                Clear
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="rounded-md border border-ink-700 px-2.5 py-1 font-semibold hover:bg-ink-800"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="rounded-lg border border-ink-700 px-3 py-2 text-sm font-semibold hover:bg-ink-800"
            >
              Clear rows
            </button>
          )
        }
      />

      <p className="hidden flex-wrap gap-x-5 gap-y-1 border-b border-ink-800 px-4 py-2.5 text-xs text-ink-400 sm:flex sm:px-8">
        <span>
          <Key>Tab</Key> next cell
        </span>
        <span>
          <Key>Enter</Key> next row
        </span>
        <span>
          <Key>↑</Key> <Key>↓</Key> move between rows
        </span>
        <span>
          <Key>Ctrl</Key>+<Key>D</Key> copy the row above
        </span>
        <span>
          <Key>Ctrl</Key>+<Key>Del</Key> remove row
        </span>
        <span>
          <Key>Ctrl</Key>+<Key>Enter</Key> add all to bag
        </span>
        <span>Moves fill in from the last one of that species you logged. Tags and date carry down.</span>
      </p>

      <div className="flex-1 overflow-x-auto lg:min-h-0 lg:overflow-y-auto">
        <div ref={grid} onKeyDown={onKeyDown} className="min-w-[1180px] px-4 pb-6 sm:px-8">
          <div
            className={`${GRID} sticky top-0 z-10 border-b border-ink-800 bg-ink-950 py-2 text-xs font-semibold text-ink-400`}
          >
            <span />
            <span>Species</span>
            <span>CP</span>
            <span>HP</span>
            <span>Fast move</span>
            <span>Charged move</span>
            <span>2nd charged</span>
            <span title="s shiny · l lucky · d shadow · p purified · f favorite">Flags</span>
            <span>Tags</span>
            <span>Caught</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <DraftLine
              key={r.key}
              row={r}
              n={i + 1}
              data={data}
              check={checks.get(r.key)!}
              showError={active !== r.key}
              speciesOptions={speciesOptions}
              moveOptions={moveOptions}
              onChange={(patch) => update(r.key, patch)}
              onFocus={() => setActive(r.key)}
              onRemove={() => removeRow(r.key)}
            />
          ))}
          <button
            onClick={() => addRowAfter(rows.length - 1)}
            className="mt-2 rounded-md border border-dashed border-ink-700 px-3 py-1.5 text-sm text-ink-400 hover:border-ink-600 hover:text-ink-100"
          >
            + Add row
          </button>
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-ink-800 bg-ink-900/95 px-4 py-3 backdrop-blur sm:px-8">
        <span className="text-sm text-ink-300 tabular-nums">
          <span className="font-semibold text-ink-100">{ready.length.toLocaleString()}</span> ready
          {broken.length > 0 && <span className="text-rose-300"> · {broken.length} to fix</span>}
        </span>
        <span className="min-w-0 flex-1 text-sm text-glow-300">{notice}</span>
        <button
          onClick={() => void saveAll()}
          disabled={!ready.length || saving}
          className="rounded-lg bg-linear-to-r from-glow-400 to-ice-400 px-4 py-2 text-sm font-bold text-ink-950 hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "Adding…" : `Add ${ready.length.toLocaleString()} to bag`}
        </button>
      </div>
    </div>
  );
}

function DraftLine({
  row,
  n,
  data,
  check,
  showError,
  speciesOptions,
  moveOptions,
  onChange,
  onFocus,
  onRemove,
}: {
  row: DraftRow;
  n: number;
  data: GameData;
  check: DraftCheck;
  showError: boolean;
  speciesOptions: Option[];
  moveOptions: (sp: Species | undefined, kind: "fast" | "charged") => Option[];
  onChange: (patch: Partial<DraftRow>) => void;
  onFocus: () => void;
  onRemove: () => void;
}) {
  const sp = row.species ? data.byId.get(row.species) : undefined;
  const flags = parseFlags(row.flags).flags;
  const cell = (col: Col) => ({ "data-row": row.key, "data-col": col });
  const input =
    "w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm placeholder:text-ink-600 focus:border-glow-500 focus:outline-none";
  const status =
    check.status === "ok" ? "text-glow-400" : check.status === "error" && showError ? "text-rose-300" : "text-ink-600";

  return (
    <div onFocus={onFocus} className="border-b border-ink-850 py-1">
      <div className={GRID}>
        <span className={`text-right text-xs tabular-nums ${status}`} title={check.status === "error" ? check.message : undefined}>
          {check.status === "ok" ? "✓" : n}
        </span>
        <ComboCell {...cell("species")}>
          <Combobox
            ariaLabel={`Row ${n} species`}
            options={speciesOptions}
            value={row.species}
            onChange={(v) => onChange({ species: v })}
            placeholder="Species"
            maxResults={8}
          />
        </ComboCell>
        <input
          {...cell("cp")}
          className={input}
          value={row.cp}
          onChange={(e) => onChange({ cp: e.target.value.replace(/[^\d,]/g, "") })}
          inputMode="numeric"
          placeholder="CP"
          aria-label={`Row ${n} CP`}
        />
        <input
          {...cell("hp")}
          className={input}
          value={row.hp}
          onChange={(e) => onChange({ hp: e.target.value.replace(/\D/g, "") })}
          inputMode="numeric"
          placeholder="HP"
          aria-label={`Row ${n} HP`}
        />
        <ComboCell {...cell("fast")}>
          <Combobox
            ariaLabel={`Row ${n} fast move`}
            options={moveOptions(sp, "fast")}
            value={row.fast}
            onChange={(v) => onChange({ fast: v })}
            disabled={!sp}
            maxResults={12}
          />
        </ComboCell>
        <ComboCell {...cell("charged")}>
          <Combobox
            ariaLabel={`Row ${n} charged move`}
            options={moveOptions(sp, "charged")}
            value={row.charged}
            onChange={(v) => onChange({ charged: v })}
            disabled={!sp}
            maxResults={12}
          />
        </ComboCell>
        <ComboCell {...cell("charged2")}>
          <Combobox
            ariaLabel={`Row ${n} second charged move`}
            options={moveOptions(sp, "charged").filter((o) => o.value !== row.charged)}
            value={row.charged2}
            onChange={(v) => onChange({ charged2: v })}
            disabled={!sp || !row.charged}
            maxResults={12}
          />
        </ComboCell>
        <input
          {...cell("flags")}
          className={input}
          value={row.flags}
          onChange={(e) => onChange({ flags: e.target.value })}
          placeholder="s l d p f"
          title={flagLabels(flags).join(", ") || "s shiny · l lucky · d shadow · p purified · f favorite"}
          aria-label={`Row ${n} flags: s shiny, l lucky, d shadow, p purified, f favorite`}
          autoComplete="off"
          spellCheck={false}
        />
        <input
          {...cell("tags")}
          className={input}
          value={row.tags}
          onChange={(e) => onChange({ tags: e.target.value })}
          placeholder="PvP, Trade"
          aria-label={`Row ${n} tags, separated by commas`}
        />
        <input
          {...cell("caught")}
          type="date"
          className={`${input} [color-scheme:dark]`}
          value={row.caught}
          max={today()}
          onChange={(e) => onChange({ caught: e.target.value })}
          aria-label={`Row ${n} date caught`}
        />
        <button
          onClick={onRemove}
          tabIndex={-1}
          title="Remove row"
          aria-label={`Remove row ${n}`}
          className="grid h-7 w-7 place-items-center rounded text-ink-600 hover:bg-ink-800 hover:text-rose-200"
        >
          ✕
        </button>
      </div>
      {(flagLabels(flags).length > 0 || (check.status === "error" && showError)) && (
        <p className="mt-1 flex flex-wrap gap-2 pl-[34px] text-xs">
          {flagLabels(flags).map((f) => (
            <span key={f} className="rounded bg-ink-800 px-1.5 py-px text-ink-300">
              {f}
            </span>
          ))}
          {check.status === "error" && showError && <span className="text-rose-300">{check.message}</span>}
        </p>
      )}
    </div>
  );
}

/**
 * Wraps a combobox so the grid's keyboard handling can find its input: the
 * data attributes are copied onto the input inside once it mounts.
 */
function ComboCell({ children, ...attrs }: { children: ReactNode; "data-row": string; "data-col": Col }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector("input");
    if (!el) return;
    el.dataset.row = attrs["data-row"];
    el.dataset.col = attrs["data-col"];
  });
  return (
    <div ref={ref} className="min-w-0">
      {children}
    </div>
  );
}
