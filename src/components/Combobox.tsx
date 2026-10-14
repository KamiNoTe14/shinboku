// A keyboard-first autocomplete: type to filter, arrow keys to move, Enter or Tab to pick.

import { forwardRef, useEffect, useId, useMemo, useState, type ReactNode } from "react";

export type Option = {
  value: string;
  label: string;
  /** Extra text that also matches when typed, e.g. a dex number. */
  keywords?: string;
  render?: ReactNode;
};

type Props = {
  options: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxResults?: number;
  ariaLabel: string;
  /** Called when Enter is pressed while the list is closed (used to submit the form). */
  onSubmitKey?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

function score(o: Option, q: string): number {
  const label = o.label.toLowerCase();
  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.split(/[\s(-]+/).some((w) => w.startsWith(q))) return 2;
  if (label.includes(q)) return 3;
  if (o.keywords?.toLowerCase().split(" ").includes(q.replace(/^#/, ""))) return 1;
  return -1;
}

export const Combobox = forwardRef<HTMLInputElement, Props>(function Combobox(
  { options, value, onChange, placeholder, disabled, className = "", maxResults = 8, ariaLabel, onSubmitKey },
  ref,
) {
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? null;
  const [text, setText] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Keep the text in sync when the value changes from outside (reset, edit mode).
  useEffect(() => {
    setText(selected?.label ?? "");
  }, [selected?.label]);

  const results = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q || (selected && text === selected.label)) return options.slice(0, maxResults);
    return options
      .map((o) => ({ o, s: score(o, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .slice(0, maxResults)
      .map((x) => x.o);
  }, [options, text, selected, maxResults]);

  const pick = (o: Option | undefined) => {
    if (!o) return;
    onChange(o.value);
    setText(o.label);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={ref}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          if (!e.target.value) onChange(null);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          setOpen(false);
          // Leaving with partial text: snap back to the chosen value.
          setText(selected?.label ?? "");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if ((e.key === "Enter" || e.key === "Tab") && open && results.length && text) {
            if (e.key === "Enter") e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Enter") {
            onSubmitKey?.(e);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="w-full rounded-md border border-ink-700 bg-ink-950 px-2.5 py-2 text-sm placeholder:text-ink-400 focus:border-glow-500 focus:outline-none disabled:opacity-40"
        autoComplete="off"
        spellCheck={false}
      />
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900 py-1 shadow-xl shadow-black/40"
        >
          {results.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
                i === active ? "bg-glow-500/15 text-ink-100" : "text-ink-300"
              }`}
            >
              {o.render ?? o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
