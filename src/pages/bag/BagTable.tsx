import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { PokemonImage } from "../../components/PokemonImage";
import type { BagPokemon } from "../../lib/bag";
import type { GameData, Species } from "../../lib/go/gamedata";
import { appraisalStars } from "../../lib/go/stats";
import { Stars } from "./EntryRow";

export type Row = BagPokemon & { sp: Species; ivPct: number | null };

export type SortKey = "added" | "name" | "cp" | "iv" | "level" | "caught";

const ROW_H = 48;
const OVERSCAN = 12;

export function BagTable({
  rows,
  data,
  selected,
  onSelect,
  onEdit,
  onKeyCommand,
  sort,
  onSort,
}: {
  rows: Row[];
  data: GameData;
  selected: Set<string>;
  onSelect: (id: string, mode: "only" | "toggle" | "range") => void;
  onEdit: (row: Row) => void;
  onKeyCommand: (e: KeyboardEvent<HTMLDivElement>) => void;
  sort: { key: SortKey; desc: boolean };
  onSort: (key: SortKey) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_H) + OVERSCAN);
  const visible = rows.slice(start, end);

  const click = (e: MouseEvent, id: string) => {
    if (e.shiftKey) onSelect(id, "range");
    else if (e.ctrlKey || e.metaKey) onSelect(id, "toggle");
    else onSelect(id, "only");
  };

  const th = (key: SortKey | null, label: string, align: "left" | "right" = "left", width?: string) => (
    <th className={`px-3 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`} style={{ width }}>
      {key ? (
        <button
          onClick={() => onSort(key)}
          className={`inline-flex items-center gap-1 hover:text-ink-100 ${sort.key === key ? "text-glow-300" : ""}`}
        >
          {label}
          {sort.key === key && <span aria-hidden="true">{sort.desc ? "↓" : "↑"}</span>}
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div
      ref={scroller}
      tabIndex={0}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyCommand}
      className="min-h-0 flex-1 overflow-y-auto focus:outline-none"
      aria-label="Your bag. Click to select, shift-click for a range, ctrl-click to add or remove."
    >
      <table className="w-full table-fixed text-sm select-none">
        <thead className="sticky top-0 z-10 bg-ink-950 text-xs text-ink-400">
          <tr className="border-b border-ink-800">
            <th className="w-14 px-1 py-2">
              <span className="sr-only">Image</span>
            </th>
            {th("name", "Pokémon", "left")}
            {th("cp", "CP", "right", "80px")}
            {th("iv", "IVs", "left", "150px")}
            {th("level", "Level", "right", "64px")}
            {th(null, "Moves", "left")}
            {th(null, "Tags", "left", "170px")}
            {th("caught", "Caught", "right", "104px")}
          </tr>
        </thead>
        <tbody>
          {start > 0 && <tr style={{ height: start * ROW_H }} aria-hidden="true" />}
          {visible.map((r) => {
            const isSel = selected.has(r.id);
            const moves = [r.fast, r.charged, r.charged2].filter(Boolean).map((m) => data.moves[m!]?.name ?? m);
            return (
              <tr
                key={r.id}
                onMouseDown={(e) => {
                  if (e.shiftKey) e.preventDefault(); // stop text selection on shift-click
                }}
                onClick={(e) => click(e, r.id)}
                onDoubleClick={() => onEdit(r)}
                style={{ height: ROW_H }}
                className={`cursor-default border-b border-ink-850 ${
                  isSel ? "bg-glow-500/15 shadow-[inset_3px_0_0_var(--color-glow-400)]" : "hover:bg-ink-900"
                }`}
                aria-selected={isSel}
              >
                <td className="px-1">
                  <PokemonImage species={r.sp} style="pixel" size={44} shiny={r.shiny} />
                </td>
                <td className="truncate px-3">
                  <span className="font-semibold">{r.sp.name}</span>
                  {r.shiny && (
                    <span className="ml-1.5 text-amber-300" title="Shiny" aria-label="Shiny">
                      ✦
                    </span>
                  )}
                  {r.favorite && (
                    <span className="ml-1.5 text-glow-400" title="Favorite" aria-label="Favorite">
                      ★
                    </span>
                  )}
                  {r.lucky && <Badge className="text-yellow-200 bg-yellow-300/12">Lucky</Badge>}
                  {r.variant === "shadow" && <Badge className="text-violet-200 bg-violet-400/15">Shadow</Badge>}
                  {r.variant === "purified" && <Badge className="text-sky-100 bg-sky-300/12">Purified</Badge>}
                  {r.nickname && <span className="ml-2 text-xs text-ink-400">“{r.nickname}”</span>}
                </td>
                <td className="px-3 text-right font-display font-semibold tabular-nums">{r.cp.toLocaleString()}</td>
                <td className="px-3">
                  {r.iv ? (
                    <span className="flex items-center gap-2">
                      <span className="flex gap-0.5" title={`${r.iv[0]} / ${r.iv[1]} / ${r.iv[2]}`}>
                        {r.iv.map((v, i) => (
                          <span key={i} className="block h-1.5 w-5 overflow-hidden rounded-full bg-ink-800">
                            <span
                              className={`block h-full ${v === 15 ? "bg-glow-400" : "bg-ice-500"}`}
                              style={{ width: `${(v / 15) * 100}%` }}
                            />
                          </span>
                        ))}
                      </span>
                      <span className={`tabular-nums ${r.ivPct === 100 ? "font-bold text-glow-300" : ""}`}>{r.ivPct}%</span>
                      <Stars
                        n={appraisalStars({ atk: r.iv[0], def: r.iv[1], sta: r.iv[2] })}
                      />
                    </span>
                  ) : (
                    <span className="text-ink-600">Not appraised</span>
                  )}
                </td>
                <td className="px-3 text-right tabular-nums text-ink-300">{r.level ?? ""}</td>
                <td className="truncate px-3 text-ink-300">{moves.join(", ")}</td>
                <td className="px-3">
                  {/* First tag, plus a count for the rest; hover to see them all. */}
                  {r.tags && r.tags.length > 0 && (
                    <span className="flex min-w-0 items-center gap-1" title={r.tags.join(", ")}>
                      <span className="min-w-0 truncate rounded bg-ink-800 px-1.5 py-0.5 text-xs text-ink-300">
                        {r.tags[0]}
                      </span>
                      {r.tags.length > 1 && (
                        <span className="shrink-0 rounded bg-ink-800 px-1.5 py-0.5 text-xs text-ink-400">
                          +{r.tags.length - 1}
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-3 text-right text-xs text-ink-400 tabular-nums">{r.caught ?? ""}</td>
              </tr>
            );
          })}
          {end < rows.length && <tr style={{ height: (rows.length - end) * ROW_H }} aria-hidden="true" />}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ children, className }: { children: string; className: string }) {
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}
