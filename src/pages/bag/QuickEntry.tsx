// One-line entry: "machop 1056 15 14 13", Enter, next. Also takes dictation.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { PokemonImage } from "../../components/PokemonImage";
import type { PokemonInput } from "../../lib/bag";
import { checkEntry } from "../../lib/go/entry";
import type { GameData, Species } from "../../lib/go/gamedata";
import { fromSpeech, parseQuick, speciesMatcher } from "../../lib/go/quickEntry";
import { speechSupported, useSpeech } from "../../lib/speech";
import { Key, readStoredDate, Stars, today } from "./EntryRow";

export function QuickEntry({
  data,
  initialSpecies,
  onSave,
}: {
  data: GameData;
  initialSpecies: Species | null;
  onSave: (input: PokemonInput) => Promise<void>;
}) {
  const [line, setLine] = useState("");
  const [last, setLast] = useState<Species | null>(initialSpecies);
  const [caught, setCaught] = useState(readStoredDate);
  const [flash, setFlash] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [count, setCount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const match = useMemo(() => speciesMatcher(data), [data]);

  useEffect(() => {
    if (initialSpecies) {
      setLast(initialSpecies);
      input.current?.focus();
    }
  }, [initialSpecies]);

  const evaluate = (text: string) => {
    const parsed = parseQuick(text, match, last);
    const ivText = parsed.iv ? parsed.iv.join(" ") : "";
    const check =
      parsed.species && parsed.cp !== null
        ? checkEntry(
            parsed.species,
            String(parsed.cp),
            parsed.hp ? String(parsed.hp) : "",
            ivText,
            !!parsed.flags.variant,
          )
        : null;
    return { parsed, check };
  };

  const { parsed, check } = evaluate(line);

  const submit = async (text: string, force: boolean) => {
    const { parsed: p, check: c } = evaluate(text);
    const blocked = p.errors.length > 0 || !c || c.status !== "ok";
    if (blocked && !(force && c?.status === "error" && c.canForce && !p.errors.length)) {
      setShaking(true);
      setTimeout(() => setShaking(false), 320);
      return;
    }
    const entry: PokemonInput = {
      species: p.species!.id,
      cp: p.cp!,
      hp: p.hp ?? undefined,
      iv: p.iv ?? undefined,
      level: c?.status === "ok" ? c.level : undefined,
      shiny: p.flags.shiny,
      lucky: p.flags.lucky,
      favorite: p.flags.favorite,
      variant: p.flags.variant,
      tags: p.tags,
      caught: caught || undefined,
    };
    setLine("");
    setLast(p.species);
    try {
      await onSave(entry);
      setCount((n) => n + 1);
      setFlash(`Added ${p.species!.name}, ${p.cp!.toLocaleString()} CP.`);
    } catch (err) {
      setLine(text);
      setFlash(`Couldn't save: ${(err as Error).message}`);
    }
  };

  const speech = useSpeech((heard, final) => {
    const { line: spoken, submit: go } = fromSpeech(heard);
    setLine(spoken);
    if (final && go) void submit(spoken, false);
  });

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit(line, e.ctrlKey || e.metaKey);
    } else if (e.key === "Escape") {
      setLine("");
    } else if (e.key.toLowerCase() === "m" && (e.ctrlKey || e.metaKey) && speechSupported()) {
      e.preventDefault();
      speech.toggle();
    }
  };

  const shown = parsed.species ?? (line.trim() ? null : last);
  const sameAsLast = !parsed.speciesText && !!last;

  return (
    <div>
      <div className={`flex flex-wrap items-stretch gap-2 sm:flex-nowrap ${shaking ? "shake" : ""}`}>
        {speechSupported() && (
          <button
            onClick={() => {
              speech.toggle();
              input.current?.focus();
            }}
            aria-pressed={speech.listening}
            title={speech.listening ? "Stop listening (Ctrl+M)" : "Speak your entries (Ctrl+M)"}
            className={`grid w-11 shrink-0 place-items-center rounded-lg border ${
              speech.listening
                ? "animate-pulse border-rose-400/70 bg-rose-400/15 text-rose-200"
                : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
            }`}
          >
            <MicIcon />
            <span className="sr-only">{speech.listening ? "Stop voice entry" : "Start voice entry"}</span>
          </button>
        )}
        <input
          ref={input}
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            last ? `${last.name.toLowerCase()} 1056 15 14 13   or just   1056 15 14 13` : "machop 1056 15 14 13"
          }
          aria-label="Quick entry: species, CP and appraisal on one line"
          autoComplete="off"
          spellCheck={false}
          // Don't pop up the on-screen keyboard as soon as the page opens on a phone.
          autoFocus={typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches}
          enterKeyHint="enter"
          className="order-first min-w-0 basis-full rounded-lg border border-ink-700 bg-ink-950 px-3.5 py-2.5 sm:order-none sm:flex-1 sm:basis-auto font-display text-lg tracking-wide placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-ink-600 focus:border-glow-500 focus:outline-none"
        />
        <input
          type="date"
          value={caught}
          max={today()}
          onChange={(e) => {
            setCaught(e.target.value);
            try {
              localStorage.setItem("entry.caught", e.target.value);
              localStorage.setItem("entry.caughtSetOn", today());
            } catch {}
          }}
          aria-label="Date caught"
          title="Date caught"
          className="h-11 min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-2.5 text-sm sm:h-auto sm:w-40 sm:flex-none [color-scheme:dark] focus:border-glow-500 focus:outline-none"
        />
        <button
          onClick={() => void submit(line, false)}
          className="rounded-lg bg-linear-to-r from-glow-400 to-ice-400 px-5 text-sm font-bold text-ink-950 hover:brightness-110"
        >
          Add
        </button>
      </div>

      {/* Live preview of what Enter will add. */}
      <div className="mt-2 flex min-h-10 items-center gap-3 text-sm" role="status" aria-live="polite">
        {shown ? (
          <PokemonImage key={shown.id} species={shown} style="pixel" size={40} shiny={!!parsed.flags.shiny} />
        ) : (
          <span className="h-10 w-10" />
        )}
        <div className="min-w-0 flex-1">
          {flash && !line ? (
            <span className="text-glow-300">{flash}</span>
          ) : !line.trim() ? (
            <span className="text-ink-400">
              {last ? (
                <>
                  Next <span className="font-semibold text-ink-200">{last.name}</span>: type its CP and appraisal. Start
                  with a name to switch.
                </>
              ) : (
                "Type the name, CP and appraisal, then Enter."
              )}
              {speech.listening && <span className="ml-2 text-rose-200">Listening… say “add” to save.</span>}
            </span>
          ) : (
            <span className="flex flex-wrap items-baseline gap-x-3">
              {shown && (
                <span className="font-semibold text-ink-100">
                  {shown.name}
                  {sameAsLast && <span className="ml-1 font-normal text-ink-400">(same as last)</span>}
                </span>
              )}
              {parsed.cp !== null && <span className="tabular-nums">{parsed.cp.toLocaleString()} CP</span>}
              {parsed.hp !== null && <span className="tabular-nums">{parsed.hp} HP</span>}
              {check?.status === "ok" && check.ivPercent !== undefined && (
                <span className="font-semibold">
                  {check.ivPercent}% <Stars n={check.stars ?? 0} />
                </span>
              )}
              {Object.entries(parsed.flags).map(([k, v]) => (
                <span key={k} className="rounded bg-ink-800 px-1.5 py-px text-xs text-ink-300">
                  {k === "variant" ? String(v) : k}
                </span>
              ))}
              {parsed.tags.map((t) => (
                <span key={t} className="text-xs text-ink-400">
                  #{t}
                </span>
              ))}
              {parsed.errors.length > 0 ? (
                <span className="text-rose-300">{parsed.errors[0]}</span>
              ) : check?.status === "error" ? (
                <span className="text-rose-300">
                  {check.message}
                  {check.canForce && <span className="text-ink-400"> Ctrl+Enter saves anyway.</span>}
                </span>
              ) : check?.status === "ok" ? (
                <span className="text-ink-400">{check.note}</span>
              ) : null}
            </span>
          )}
          {speech.error && <p className="text-rose-300">{speech.error}</p>}
        </div>
        {count > 0 && (
          <span className="shrink-0 text-xs text-ink-400 tabular-nums">
            {count.toLocaleString()} added this session
          </span>
        )}
      </div>

      <p className="mt-1 hidden flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400 sm:flex">
        <span>
          Appraisal: <code className="text-ink-300">15 14 13</code>, <code className="text-ink-300">15/14/13</code> or{" "}
          <code className="text-ink-300">151413</code>, or leave it off
        </span>
        <span>
          HP: <code className="text-ink-300">hp120</code>
        </span>
        <span>
          Flags: <code className="text-ink-300">shiny lucky shadow purified fav</code> or{" "}
          <code className="text-ink-300">s l d p f</code>
        </span>
        <span>
          Tags: <code className="text-ink-300">#pvp</code>
        </span>
        {speechSupported() && (
          <span>
            <Key>Ctrl</Key>+<Key>M</Key> voice
          </span>
        )}
      </p>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  );
}
