// The "catch card": one Pokémon's details, with power-up and evolve controls,
// shown beside the bag when a single Pokémon is selected.

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { PokemonImage } from "../../components/PokemonImage";
import { TypeBadge, TYPE_COLORS } from "../../components/TypeBadge";
import type { Row } from "../../lib/bagRows";
import { canPowerUp, currentLevel, MAX_POWER_LEVEL } from "../../lib/actions";
import type { GameData, Species } from "../../lib/go/gamedata";
import { describeCost } from "../../lib/go/powerup";
import { appraisalStars, calcHP } from "../../lib/go/stats";
import { requirements } from "../../lib/raids";
import { Stars } from "./EntryRow";

export function CatchCard({
  row,
  data,
  onPowerUp,
  onEvolve,
  onEdit,
  onFavorite,
  onClose,
  onKeyDown,
}: {
  row: Row;
  data: GameData;
  onPowerUp: (to?: number) => void;
  onEvolve: (target: Species, newCp?: number) => void;
  onEdit: () => void;
  onFavorite: () => void;
  onClose: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}) {
  const sp = row.sp;
  const level = currentLevel(row, sp);
  const iv = row.iv ? { atk: row.iv[0], def: row.iv[1], sta: row.iv[2] } : null;
  const maxHp = row.hp ?? (iv && level ? calcHP(sp, iv, level) : null);
  const one = canPowerUp(row, sp, data);
  const jumpTo = level !== null && level < 40 ? 40 : MAX_POWER_LEVEL;
  const jump = canPowerUp(row, sp, data, jumpTo);
  const tint = TYPE_COLORS[sp.types[0]];
  const tint2 = TYPE_COLORS[sp.types[1] ?? sp.types[0]];
  const evolutions = Object.entries(sp.evo ?? {})
    .map(([id, cost]) => ({ to: data.byId.get(id), cost }))
    .filter((e): e is { to: Species; cost: typeof e.cost } => !!e.to && !e.to.unreleased);

  return (
    <aside
      onKeyDown={onKeyDown}
      className="flex w-[400px] shrink-0 flex-col overflow-y-auto border-l border-ink-800 bg-ink-950"
      aria-label={`${sp.name} details`}
    >
      {/* Hero: CP, level arc and the 3D render, tinted by type like the in-game card. */}
      <div
        className="relative px-5 pt-4 pb-3"
        style={{
          background: `radial-gradient(120% 90% at 50% 0%, ${tint}38, transparent 65%), radial-gradient(80% 60% at 85% 30%, ${tint2}22, transparent 70%)`,
        }}
      >
        <div className="flex items-start justify-between">
          <IconButton onClick={onClose} label="Close">
            ✕
          </IconButton>
          <div className="text-center">
            <span className="font-display text-sm font-semibold tracking-widest text-ink-300">CP</span>
            <span className="ml-1 font-display text-4xl font-bold tabular-nums">{row.cp.toLocaleString()}</span>
          </div>
          <IconButton onClick={onFavorite} label={row.favorite ? "Unfavorite" : "Favorite"} on={row.favorite}>
            ★
          </IconButton>
        </div>

        <div className="relative mx-auto mt-1 h-[200px] w-[300px]">
          <LevelArc level={level} />
          <div className="absolute inset-x-0 bottom-0 flex justify-center">
            <PokemonImage
              key={`${sp.id}-${row.shiny}`}
              species={sp}
              style="home"
              size={176}
              shiny={row.shiny}
              eager
              className={
                row.variant === "shadow"
                  ? "drop-shadow-[0_0_18px_rgba(167,139,250,0.75)]"
                  : "drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
              }
            />
          </div>
        </div>

        <div className="mt-2 text-center">
          <h2 className="font-display text-2xl font-bold">
            {row.nickname ?? sp.name}
            {row.shiny && (
              <span className="ml-1.5 text-lg text-amber-300" title="Shiny">
                ✦
              </span>
            )}
          </h2>
          {row.nickname && <p className="text-sm text-ink-400">{sp.name}</p>}
          <div className="mt-1.5 flex justify-center gap-1.5">
            {row.lucky && <Flag className="bg-yellow-300/15 text-yellow-200">Lucky</Flag>}
            {row.variant === "shadow" && <Flag className="bg-violet-400/15 text-violet-200">Shadow</Flag>}
            {row.variant === "purified" && <Flag className="bg-sky-300/15 text-sky-100">Purified</Flag>}
          </div>
          <div className="mx-auto mt-3 w-56">
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-glow-400" style={{ width: maxHp ? "100%" : "0%" }} />
            </div>
            <p className="mt-1 text-xs text-ink-300 tabular-nums">
              {maxHp ? `${maxHp} / ${maxHp} HP` : "HP not entered"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-ink-800 rounded-xl border border-ink-800 bg-ink-950/60 text-center">
          <Stat label="Type">
            <span className="flex flex-wrap justify-center gap-1">
              {sp.types.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </span>
          </Stat>
          <Stat label="Level">{level ?? "?"}</Stat>
          <Stat label="Caught">{row.caught ? formatDate(row.caught) : "—"}</Stat>
        </div>
      </div>

      <Section title="Power up">
        {one.ok ? (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPowerUp()}
                
                className="flex-1 rounded-lg bg-linear-to-r from-glow-400 to-ice-400 px-3 py-2 text-sm font-bold text-ink-950 hover:brightness-110 disabled:opacity-50"
              >
                Power up
                <span className="mt-0.5 block text-[11px] font-semibold opacity-80">{describeCost(one.cost)}</span>
              </button>
              {jump.ok && jump.next > one.next && (
                <button
                  onClick={() => onPowerUp(jumpTo)}
                  
                  className="flex-1 rounded-lg border border-ink-700 px-3 py-2 text-sm font-semibold hover:bg-ink-800 disabled:opacity-50"
                >
                  To level {jump.next}
                  <span className="mt-0.5 block text-[11px] font-normal text-ink-400">{describeCost(jump.cost)}</span>
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-ink-400">
              Level {one.level} → {one.next}. Press <kbd>P</kbd> to power up the selected Pokémon.
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-400">{one.reason}</p>
        )}
      </Section>

      {evolutions.length > 0 && (
        <Section title="Evolve">
          <ul className="space-y-2">
            {evolutions.map((e) => (
              <EvolveOption key={e.to.id} row={row} to={e.to} cost={e.cost} onEvolve={onEvolve} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-400">
            Evolving rerolls its moves, so they're cleared. Add the new ones with Edit.
          </p>
        </Section>
      )}

      <Section title="Appraisal">
        {iv ? (
          <>
            <div className="mb-2 flex items-center justify-between text-sm">
              <Stars n={appraisalStars(iv)} />
              <span className={`font-display font-bold tabular-nums ${row.ivPct === 100 ? "text-glow-300" : ""}`}>
                {row.ivPct}%
              </span>
            </div>
            <IvBar label="Attack" v={iv.atk} />
            <IvBar label="Defense" v={iv.def} />
            <IvBar label="HP" v={iv.sta} />
          </>
        ) : (
          <p className="text-sm text-ink-400">Not appraised yet.</p>
        )}
      </Section>

      <Section title="Moves">
        {row.fast || row.charged || row.charged2 ? (
          <ul className="space-y-1.5 text-sm">
            {[row.fast, row.charged, row.charged2].map((m, i) =>
              m ? (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span>
                    {data.moves[m]?.name ?? m}
                    {(sp.elite?.includes(m) || sp.legacy?.includes(m)) && (
                      <span className="ml-1 text-amber-200" title="Needs an Elite TM">
                        ★
                      </span>
                    )}
                    <span className="ml-2 text-xs text-ink-400">{i === 0 ? "Fast" : "Charged"}</span>
                  </span>
                  {data.moves[m] && <TypeBadge type={data.moves[m].type} />}
                </li>
              ) : null,
            )}
          </ul>
        ) : (
          <p className="text-sm text-ink-400">No moves entered.</p>
        )}
      </Section>

      {row.tags && row.tags.length > 0 && (
        <Section title="Tags">
          <div className="flex flex-wrap gap-1">
            {row.tags.map((t) => (
              <span key={t} className="rounded bg-ink-800 px-1.5 py-0.5 text-xs text-ink-300">
                #{t}
              </span>
            ))}
          </div>
        </Section>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-ink-800 px-5 py-3">
        <button
          onClick={onEdit}
          className="rounded-md border border-ink-700 px-3 py-1.5 text-sm font-semibold hover:bg-ink-800"
        >
          Edit
        </button>
        <span className="text-xs text-ink-400">
          <kbd>E</kbd> edit · <kbd>P</kbd> power up · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo
        </span>
      </div>
    </aside>
  );
}

function EvolveOption({
  row,
  to,
  cost,
  onEvolve,
}: {
  row: Row;
  to: Species;
  cost: NonNullable<Species["evo"]>[string];
  onEvolve: (target: Species, newCp?: number) => void;
}) {
  const [cp, setCp] = useState("");
  useEffect(() => setCp(""), [row.id, row.species]);
  const needsCp = !row.iv;
  const candy = (row.variant === "purified" && cost.candyPurified) || cost.candy;
  const reqs = requirements([{ to, cost }]);
  const n = Number(cp);
  const cpOk = !needsCp || (Number.isInteger(n) && n >= 10);

  return (
    <li className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/50 p-2">
      <PokemonImage species={to} style="pixel" size={40} shiny={row.shiny} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{to.name}</p>
        <p className="text-xs text-ink-400">
          <span className="font-semibold text-ink-200">{candy}</span> candy
          {reqs.length > 0 && <span> · {reqs.join(" · ")}</span>}
        </p>
      </div>
      <form
        className="flex shrink-0 items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (cpOk) onEvolve(to, needsCp ? n : undefined);
        }}
      >
        {needsCp && (
          <input
            value={cp}
            onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))}
            placeholder="New CP"
            inputMode="numeric"
            aria-label={`CP after evolving into ${to.name}`}
            className="w-20 rounded-md border border-ink-700 bg-ink-950 px-2 py-1 text-sm placeholder:text-ink-400 focus:border-glow-500 focus:outline-none"
          />
        )}
        <button
          type="submit"
          disabled={!cpOk}
          className="rounded-md border border-glow-500/50 bg-glow-500/10 px-2.5 py-1 text-sm font-semibold text-glow-300 hover:bg-glow-500/20 disabled:opacity-40"
        >
          Evolve
        </button>
      </form>
    </li>
  );
}

/** The in-game arc behind the Pokémon, with a dot showing how far it's been powered up. */
function LevelArc({ level }: { level: number | null }) {
  const r = 135;
  const cx = 150;
  const cy = 165;
  const t = level ? Math.min(1, (level - 1) / (MAX_POWER_LEVEL - 1)) : 0;
  const angle = Math.PI * (1 - t);
  return (
    <svg viewBox="0 0 300 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="3"
      />
      {level !== null && (
        <>
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(angle)} ${cy - r * Math.sin(angle)}`}
            fill="none"
            stroke="var(--color-glow-400)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={cx + r * Math.cos(angle)} cy={cy - r * Math.sin(angle)} r="6" fill="#fff" />
        </>
      )}
    </svg>
  );
}

function IvBar({ label, v }: { label: string; v: number }) {
  return (
    <div className="mb-1.5 grid grid-cols-[64px_1fr_24px] items-center gap-2 text-xs">
      <span className="text-ink-300">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-ink-800">
        <span
          className={`block h-full rounded-full ${v === 15 ? "bg-rose-400" : "bg-amber-400"}`}
          style={{ width: `${(v / 15) * 100}%` }}
        />
      </span>
      <span className="text-right font-semibold tabular-nums">{v}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-ink-800 px-5 py-4">
      <h3 className="mb-2 text-xs font-semibold tracking-wider text-ink-400 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-2 py-2.5">
      <div className="font-display text-base font-semibold tabular-nums">{children}</div>
      <div className="mt-0.5 text-[11px] text-ink-400">{label}</div>
    </div>
  );
}

function Flag({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

function IconButton({
  onClick,
  label,
  on,
  children,
}: {
  onClick: () => void;
  label: string;
  on?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-full text-base hover:bg-white/10 ${on ? "text-glow-300" : "text-ink-400"}`}
    >
      {children}
    </button>
  );
}

function formatDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? ymd
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
