import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Combobox, type Option } from "../../components/Combobox";
import { PokemonImage } from "../../components/PokemonImage";
import { TypeBadge } from "../../components/TypeBadge";
import type { GameData, Species } from "../../lib/go/gamedata";
import { checkEntry, FLAG_KEYS, parseAppraisal, parseWholeNumber, type FlagName } from "../../lib/go/entry";
import type { BagPokemon, PokemonInput, Variant } from "../../lib/bag";
import { QuickEntry } from "./QuickEntry";

type Mode = "quick" | "full";

function readMode(): Mode {
  try {
    return localStorage.getItem("entry.mode") === "full" ? "full" : "quick";
  } catch {
    return "quick";
  }
}

type Flags = { shiny: boolean; lucky: boolean; favorite: boolean; variant: Variant | null };
const NO_FLAGS: Flags = { shiny: false, lucky: false, favorite: false, variant: null };

export const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

export function readStoredDate() {
  try {
    const d = localStorage.getItem("entry.caught");
    // Only reuse a remembered date from today's session; otherwise default to today.
    if (d && localStorage.getItem("entry.caughtSetOn") === today()) return d;
  } catch {}
  return today();
}

const field =
  "w-full rounded-md border border-ink-700 bg-ink-950 px-2.5 py-2 text-sm placeholder:text-ink-400 focus:border-glow-500 focus:outline-none";

export function EntryRow({
  data,
  editing,
  initialSpecies = null,
  onSave,
  onCancelEdit,
}: {
  data: GameData;
  editing: BagPokemon | null;
  initialSpecies?: Species | null;
  onSave: (input: PokemonInput) => Promise<void>;
  onCancelEdit: () => void;
}) {
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [cp, setCp] = useState("");
  const [hp, setHp] = useState("");
  const [iv, setIv] = useState("");
  const [fast, setFast] = useState<string | null>(null);
  const [charged, setCharged] = useState<string | null>(null);
  const [charged2, setCharged2] = useState<string | null>(null);
  const [flags, setFlags] = useState<Flags>(NO_FLAGS);
  const [nickname, setNickname] = useState("");
  const [tags, setTags] = useState("");
  const [caught, setCaught] = useState(readStoredDate);
  const [saving, setSaving] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const speciesRef = useRef<HTMLInputElement>(null);
  const [modeChoice, setModeChoice] = useState<Mode>(readMode);
  const mode: Mode = editing ? "full" : modeChoice;
  const chooseMode = (m: Mode) => {
    setModeChoice(m);
    try {
      localStorage.setItem("entry.mode", m);
    } catch {}
  };

  useEffect(() => {
    if (initialSpecies) setSpeciesId(initialSpecies.id);
  }, [initialSpecies]);

  const species = speciesId ? (data.byId.get(speciesId) ?? null) : null;

  // Load a Pokémon into the row when editing starts.
  useEffect(() => {
    if (!editing) return;
    setSpeciesId(editing.species);
    setCp(String(editing.cp));
    setHp(editing.hp ? String(editing.hp) : "");
    setIv(editing.iv ? editing.iv.join(" ") : "");
    setFast(editing.fast ?? null);
    setCharged(editing.charged ?? null);
    setCharged2(editing.charged2 ?? null);
    setFlags({
      shiny: !!editing.shiny,
      lucky: !!editing.lucky,
      favorite: !!editing.favorite,
      variant: editing.variant ?? null,
    });
    setNickname(editing.nickname ?? "");
    setTags((editing.tags ?? []).join(", "));
    setCaught(editing.caught ?? "");
    setTimeout(() => speciesRef.current?.focus(), 0);
  }, [editing]);

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

  const moveOptions = (s: Species | null, kind: "fast" | "charged"): Option[] =>
    (s?.[kind] ?? []).map((id) => {
      const m = data.moves[id];
      const tag = s?.elite?.includes(id) ? "Elite TM" : s?.legacy?.includes(id) ? "Legacy" : null;
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

  // Drop moves this species can't learn when the species changes.
  useEffect(() => {
    if (!species) return;
    if (fast && !species.fast.includes(fast)) setFast(null);
    if (charged && !species.charged.includes(charged)) setCharged(null);
    if (charged2 && !species.charged.includes(charged2)) setCharged2(null);
  }, [species]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = checkEntry(species, cp, hp, iv, flags.variant !== null);

  const reset = () => {
    setCp("");
    setHp("");
    setIv("");
    setFast(null);
    setCharged(null);
    setCharged2(null);
    setFlags(NO_FLAGS);
    setNickname("");
    setTags("");
  };

  const submit = async (force: boolean) => {
    if (saving) return;
    if (check.status === "empty" || (check.status === "error" && !(force && check.canForce))) {
      setShaking(true);
      setTimeout(() => setShaking(false), 320);
      return;
    }
    const ivs = parseAppraisal(iv);
    const hpNum = parseWholeNumber(hp);
    const input: PokemonInput = {
      species: species!.id,
      cp: parseWholeNumber(cp) as number,
      hp: typeof hpNum === "number" ? hpNum : undefined,
      iv: Array.isArray(ivs) ? ivs : undefined,
      level: check.status === "ok" ? check.level : undefined,
      fast: fast ?? undefined,
      charged: charged ?? undefined,
      charged2: charged2 ?? undefined,
      nickname: nickname.trim() || undefined,
      shiny: flags.shiny,
      lucky: flags.lucky,
      favorite: flags.favorite,
      variant: flags.variant ?? undefined,
      tags: [
        ...new Set(
          tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ],
      caught: caught || undefined,
    };
    setSaving(true);
    try {
      await onSave(input);
      setFlash(
        editing ? `Saved changes to ${species!.name}.` : `Added ${species!.name}, ${input.cp.toLocaleString()} CP.`,
      );
      if (!editing) {
        reset();
        // Keep the species selected so runs of the same Pokémon are quick; typing replaces it.
        speciesRef.current?.focus();
      }
    } catch (err) {
      setFlash(`Couldn't save: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const onKeys = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.defaultPrevented) {
      e.preventDefault();
      void submit(e.ctrlKey || e.metaKey);
    } else if (e.key === "Escape") {
      if (editing) onCancelEdit();
      else reset();
    }
  };

  const toggleFlag = (name: FlagName) =>
    setFlags((f) => {
      if (name === "shadow" || name === "purified") return { ...f, variant: f.variant === name ? null : name };
      return { ...f, [name]: !f[name] };
    });

  const setCaughtDate = (v: string) => {
    setCaught(v);
    try {
      localStorage.setItem("entry.caught", v);
      localStorage.setItem("entry.caughtSetOn", today());
    } catch {}
  };

  return (
    <section
      className={`border-b border-ink-800 px-8 py-4 ${editing ? "bg-ice-500/[0.06]" : "bg-ink-900/40"}`}
      onKeyDown={onKeys}
      aria-label={editing ? "Edit Pokémon" : "Add a Pokémon"}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold">
          {editing ? `Editing ${data.byId.get(editing.species)?.name ?? "Pokémon"}` : "Add a Pokémon"}
        </h2>
        <div className="flex items-center gap-4 text-xs text-ink-400">
          {mode === "full" && (
            <p className="flex gap-4">
              <span>
                <Key>Tab</Key> next field
              </span>
              <span>
                <Key>Enter</Key> {editing ? "save" : "add"}
              </span>
              <span>
                <Key>Esc</Key> {editing ? "cancel" : "clear"}
              </span>
            </p>
          )}
          {!editing && (
            <span className="flex rounded-md border border-ink-700 p-0.5" role="group" aria-label="Entry style">
              {(["quick", "full"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => chooseMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded px-2 py-0.5 font-semibold ${
                    mode === m ? "bg-ink-700 text-ink-100" : "text-ink-400 hover:text-ink-100"
                  }`}
                >
                  {m === "quick" ? "Quick line" : "Full form"}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      {mode === "quick" ? (
        <QuickEntry data={data} initialSpecies={initialSpecies} onSave={onSave} />
      ) : (
        <>
          <div
            className={`grid grid-cols-[2fr_0.8fr_0.7fr_1fr_1.5fr_1.5fr_auto] items-end gap-2 ${shaking ? "shake" : ""}`}
          >
            <Field label="Species">
              <Combobox
                ref={speciesRef}
                ariaLabel="Species"
                options={speciesOptions}
                value={speciesId}
                onChange={setSpeciesId}
                placeholder="Type a name or number"
              />
            </Field>
            <Field label="CP">
              <input
                className={field}
                value={cp}
                onChange={(e) => setCp(e.target.value)}
                inputMode="numeric"
                aria-label="CP"
              />
            </Field>
            <Field label="HP" hint="optional">
              <input
                className={field}
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                inputMode="numeric"
                aria-label="HP"
              />
            </Field>
            <Field label="Appraisal" hint="atk def hp">
              <input
                className={field}
                value={iv}
                onChange={(e) => setIv(e.target.value)}
                placeholder="15 14 13"
                aria-label="Appraisal: attack, defense and HP from 0 to 15"
              />
            </Field>
            <Field label="Fast move" hint="optional">
              <Combobox
                ariaLabel="Fast move"
                options={moveOptions(species, "fast")}
                value={fast}
                onChange={setFast}
                disabled={!species}
                maxResults={12}
              />
            </Field>
            <Field label="Charged move" hint="optional">
              <Combobox
                ariaLabel="Charged move"
                options={moveOptions(species, "charged")}
                value={charged}
                onChange={setCharged}
                disabled={!species}
                maxResults={12}
              />
            </Field>
            <button
              onClick={() => void submit(false)}
              disabled={saving}
              className="h-[38px] rounded-md bg-linear-to-r from-glow-400 to-ice-400 px-5 text-sm font-bold text-ink-950 hover:brightness-110 disabled:opacity-60"
            >
              {editing ? "Save" : "Add"}
            </button>
          </div>

          <div className="mt-2 grid grid-cols-[1.6fr_1fr_1.2fr_1.2fr_0.9fr] items-end gap-2">
            <Field label="Flags" hint="type s l d p f">
              <FlagPicker flags={flags} onToggle={toggleFlag} />
            </Field>
            <Field label="Nickname" hint="optional">
              <input
                className={field}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={30}
                aria-label="Nickname"
              />
            </Field>
            <Field label="Second charged move" hint="optional">
              <Combobox
                ariaLabel="Second charged move"
                options={moveOptions(species, "charged").filter((o) => o.value !== charged)}
                value={charged2}
                onChange={setCharged2}
                disabled={!species || !charged}
                maxResults={12}
              />
            </Field>
            <Field label="Tags" hint="comma separated">
              <input
                className={field}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="PvP, Trade"
                aria-label="Tags, separated by commas"
              />
            </Field>
            <Field label="Caught">
              <input
                type="date"
                className={`${field} [color-scheme:dark]`}
                value={caught}
                max={today()}
                aria-label="Date caught"
                onChange={(e) => setCaughtDate(e.target.value)}
              />
            </Field>
          </div>

          <p className="mt-2.5 min-h-5 text-sm" role="status" aria-live="polite">
            {flash ? (
              <span className="text-glow-300">{flash}</span>
            ) : check.status === "error" ? (
              <span className="text-rose-300">
                {check.message}
                {check.canForce && <span className="text-ink-400"> Press Ctrl+Enter to save anyway.</span>}
              </span>
            ) : check.status === "ok" ? (
              <span className="text-ink-300">
                {check.ivPercent !== undefined && (
                  <span className="mr-3 font-semibold text-ink-100">
                    {check.ivPercent}% <Stars n={check.stars ?? 0} />
                  </span>
                )}
                {check.note}
              </span>
            ) : null}
          </p>
        </>
      )}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-xs text-ink-300" aria-hidden="true">
        {label}
        {hint && <span className="ml-1.5 text-ink-400/80">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

export function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ink-700 px-1 font-sans text-[11px] text-ink-300">{children}</kbd>;
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-tight text-amber-300" aria-label={`${n} star appraisal`}>
      {"★".repeat(n)}
      <span className="text-ink-700">{"★".repeat(3 - n)}</span>
    </span>
  );
}

const FLAG_LABELS: { key: string; name: FlagName; label: string; on: string }[] = [
  { key: "s", name: "shiny", label: "Shiny", on: "border-amber-300/60 bg-amber-300/15 text-amber-200" },
  { key: "l", name: "lucky", label: "Lucky", on: "border-yellow-300/60 bg-yellow-300/15 text-yellow-200" },
  { key: "d", name: "shadow", label: "Shadow", on: "border-violet-400/60 bg-violet-400/15 text-violet-200" },
  { key: "p", name: "purified", label: "Purified", on: "border-sky-300/60 bg-sky-300/15 text-sky-100" },
  { key: "f", name: "favorite", label: "Favorite", on: "border-glow-400/60 bg-glow-400/15 text-glow-300" },
];

function FlagPicker({ flags, onToggle }: { flags: Flags; onToggle: (f: FlagName) => void }) {
  const isOn = (name: FlagName) =>
    name === "shadow" || name === "purified" ? flags.variant === name : flags[name as "shiny" | "lucky" | "favorite"];

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label="Flags: press s for shiny, l lucky, d shadow, p purified, f favorite"
      onKeyDown={(e) => {
        const name = FLAG_KEYS[e.key.toLowerCase() as keyof typeof FLAG_KEYS];
        if (name && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          onToggle(name);
        }
      }}
      className="flex h-[38px] items-center gap-1 rounded-md border border-ink-700 bg-ink-950 px-1.5 focus:border-glow-500 focus:outline-none"
    >
      {FLAG_LABELS.map((f) => (
        <button
          key={f.key}
          type="button"
          tabIndex={-1}
          onClick={() => onToggle(f.name)}
          className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${
            isOn(f.name) ? f.on : "border-transparent text-ink-400 hover:text-ink-100"
          }`}
        >
          <span className="underline decoration-dotted underline-offset-2">{f.label[0]}</span>
          {f.label.slice(1)}
        </button>
      ))}
    </div>
  );
}
