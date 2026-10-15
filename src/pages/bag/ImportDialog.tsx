import { useEffect, useRef, useState } from "react";
import { importPokemon, type ImportMode } from "../../lib/bag";
import { csvToBag, type ImportResult } from "../../lib/bagCsv";
import type { GameData } from "../../lib/go/gamedata";

export function ImportDialog({
  uid,
  data,
  existingIds,
  onClose,
  onDone,
}: {
  uid: string;
  data: GameData;
  existingIds: Set<string>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [file, setFile] = useState<{ name: string; result: ImportResult } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const read = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setConfirmReplace(false);
    if (f.size > 5_000_000) {
      setError("That file is over 5 MB, which is far bigger than any bag backup. Check that you picked the right file.");
      return;
    }
    setFile({ name: f.name, result: csvToBag(await f.text(), data) });
  };

  const run = async (mode: ImportMode) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const n = await importPokemon(uid, file.result.items, mode);
      onDone(
        mode === "replace"
          ? `Replaced your bag with ${n.toLocaleString()} Pokémon from ${file.name}.`
          : `Imported ${n.toLocaleString()} Pokémon from ${file.name}.`,
      );
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
      setBusy(false);
    }
  };

  const items = file?.result.items ?? [];
  const updates = items.filter((it) => it.id && existingIds.has(it.id)).length;
  const errors = file?.result.errors ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-6 backdrop-blur-sm">
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="w-full max-w-xl rounded-2xl border border-ink-700 bg-ink-900 p-6 shadow-2xl shadow-black/60 focus:outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 id="import-title" className="text-lg font-bold">
            Import Pokémon
          </h2>
          <button onClick={onClose} disabled={busy} className="text-sm text-ink-400 hover:text-ink-100">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-300">
          Use a Shinboku backup, or any CSV with at least species and cp columns. You can edit a backup in Excel or
          Google Sheets and import it again: rows with a matching ID update that Pokémon.
        </p>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void read(e.dataTransfer.files[0]);
          }}
          className={`mt-4 flex w-full flex-col items-center rounded-xl border-2 border-dashed px-4 py-6 text-sm ${
            dragging ? "border-glow-400 bg-glow-500/10" : "border-ink-700 hover:border-ink-600"
          }`}
        >
          <span className="font-semibold">{file ? file.name : "Choose a CSV file"}</span>
          <span className="mt-1 text-ink-400">{file ? "Choose a different file" : "or drop it here"}</span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {file && (
          <div className="mt-4 space-y-2 text-sm">
            <p>
              <span className="font-semibold text-glow-300">{items.length.toLocaleString()} Pokémon</span> ready to
              import
              {updates > 0 && <span className="text-ink-300">, including {updates.toLocaleString()} already in your bag that will be updated</span>}
              .
            </p>
            {errors.length > 0 && (
              <div className="rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-3">
                <p className="text-amber-100">
                  {items.length === 0 && file.result.total === 0
                    ? errors[0]
                    : `${errors.length.toLocaleString()} row${errors.length === 1 ? " has" : "s have"} problems and will be skipped:`}
                </p>
                {!(items.length === 0 && file.result.total === 0) && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-ink-300">
                    {errors.slice(0, 8).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                    {errors.length > 8 && <li>…and {(errors.length - 8).toLocaleString()} more.</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

        {file && items.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {confirmReplace ? (
              <>
                <span className="mr-auto text-sm text-rose-200">
                  This deletes the {existingIds.size.toLocaleString()} Pokémon in your bag first. It can't be undone.
                </span>
                <button
                  onClick={() => setConfirmReplace(false)}
                  disabled={busy}
                  className="rounded-md border border-ink-700 px-3 py-1.5 text-sm font-semibold hover:bg-ink-800"
                >
                  Go back
                </button>
                <button
                  onClick={() => void run("replace")}
                  disabled={busy}
                  className="rounded-md border border-rose-400/50 bg-rose-400/15 px-3 py-1.5 text-sm font-semibold text-rose-100 hover:bg-rose-400/25"
                >
                  {busy ? "Replacing…" : "Replace my bag"}
                </button>
              </>
            ) : (
              <>
                {existingIds.size > 0 && (
                  <button
                    onClick={() => setConfirmReplace(true)}
                    disabled={busy}
                    className="mr-auto rounded-md border border-ink-700 px-3 py-1.5 text-sm font-semibold text-ink-300 hover:bg-ink-800"
                  >
                    Replace my whole bag instead
                  </button>
                )}
                <button
                  onClick={() => void run("merge")}
                  disabled={busy}
                  className="rounded-md bg-linear-to-r from-glow-400 to-ice-400 px-4 py-1.5 text-sm font-bold text-ink-950 hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? "Importing…" : `Import ${items.length.toLocaleString()} Pokémon`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
