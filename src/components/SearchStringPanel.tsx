import { useEffect, useRef } from "react";
import type { SearchResult } from "../lib/go/searchString";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Floating list of Pokémon GO search strings for a selection, shown under an action bar. */
export function SearchStringPanel({
  results,
  onCopy,
  onClose,
}: {
  results: SearchResult[];
  onCopy: (query: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Close on Escape or a click anywhere outside the panel.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => document.addEventListener("mousedown", onDown));
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="absolute inset-x-4 sm:inset-x-8 top-full z-20 mt-2 rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm shadow-2xl shadow-black/50">
      <div className="flex items-start justify-between gap-4">
        <p className="text-ink-300">
          {results.length === 1
            ? "Paste this into the search bar on Pokémon GO's Pokémon screen to pull up your selection:"
            : `Your selection is split into ${results.length} searches to keep each one short. Copy them one at a time:`}
        </p>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-100">
          Close
        </button>
      </div>
      <ul className="mt-3 space-y-1.5">
        {results.map((r, i) => (
          <li key={i} className="flex items-center gap-3">
            <code className="min-w-0 flex-1 truncate rounded-md border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-glow-300">
              {r.query}
            </code>
            <span className="w-60 shrink-0 text-xs text-ink-400">
              Finds {r.count} selected
              {r.extras > 0 ? `, plus ${r.extras} other${r.extras === 1 ? "" : "s"} with the same species and CP` : ""}
            </span>
            <button
              onClick={() => onCopy(r.query)}
              className="rounded-md border border-ink-700 px-2.5 py-1 text-sm font-semibold hover:bg-ink-800"
            >
              Copy
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
