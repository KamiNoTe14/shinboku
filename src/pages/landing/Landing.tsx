import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../auth/AuthProvider";
import { Logo } from "../../components/Logo";
import { makeWall, type WallRow } from "./bagWall";
import "./landing.css";

const WALL_ROWS = 48;

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="landing min-h-full">
      <TopBar signedIn={!!user} />
      <Hero signedIn={!!user} />
      <HowItWorks />
      <Recommendations />
      <Footer signedIn={!!user} />
    </div>
  );
}

function TopBar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="absolute inset-x-0 top-0 z-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link to="/" aria-label="Shinboku home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <Link to="/pokedex" className="hidden rounded-md px-3 py-2 text-ink-300 hover:text-ink-100 sm:block">
            Pokédex
          </Link>
          <Link to="/raids" className="hidden rounded-md px-3 py-2 text-ink-300 hover:text-ink-100 sm:block">
            Raid counters
          </Link>
          <Link
            to={signedIn ? "/bag" : "/signin"}
            className="ml-2 rounded-lg border border-ink-600 bg-ink-950/50 px-4 py-2 text-ink-100 backdrop-blur hover:border-glow-400 hover:text-glow-300"
          >
            {signedIn ? "Open your bag" : "Sign in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="hero">
      <BagWall />
      <div className="hero-tint" aria-hidden="true" />

      <div className="mx-auto w-full max-w-7xl px-6 pt-28 pb-20">
        <div className="max-w-2xl">
          <h1>Your whole Pokémon GO bag on one screen.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
            Two thousand Pokémon is a lot of scrolling on a phone. Shinboku puts them in a desktop table
            you can sort, filter and select in bulk, then tells you what to transfer, power up and
            bring to your next raid.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to={signedIn ? "/bag" : "/signin"}
              className="rounded-lg bg-linear-to-r from-glow-400 to-ice-400 px-6 py-3.5 text-base font-bold text-ink-950 shadow-[0_8px_30px_rgba(82,216,178,0.25)] hover:brightness-110"
            >
              {signedIn ? "Open your bag" : "Create a free account"}
            </Link>
            <Link
              to="/pokedex"
              className="rounded-lg border border-ink-600 bg-ink-950/50 px-6 py-3.5 text-base font-semibold text-ink-100 backdrop-blur hover:border-glow-400"
            >
              Browse the Pokédex
            </Link>
          </div>
          <p className="mt-6 text-sm text-ink-400">
            Early access. Your bag and the Pokédex work today; recommendations are being built now.
          </p>
        </div>
      </div>
    </section>
  );
}

function BagWall() {
  const rows = useMemo(() => makeWall(WALL_ROWS), []);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // Every few seconds, "shift-click" a block of rows so the selection glows.
  useEffect(() => {
    if (paused || reducedMotion.current) return;
    let clear: number | undefined;
    // Work out which row is currently near the top of the wall, so the
    // selection lands on rows that are actually on screen.
    const firstVisibleRow = () => {
      const track = trackRef.current;
      if (!track) return 0;
      const ty = new DOMMatrixReadOnly(getComputedStyle(track).transform).m42;
      const rowPitch = track.scrollHeight / (WALL_ROWS * 2);
      return Math.floor(-ty / rowPitch);
    };
    const tick = () => {
      const start = (firstVisibleRow() + 5 + Math.floor(Math.random() * 8)) % (WALL_ROWS - 8);
      const len = 3 + Math.floor(Math.random() * 5);
      setSelected(new Set(Array.from({ length: len }, (_, i) => start + i)));
      clear = window.setTimeout(() => setSelected(new Set()), 2400);
    };
    tick();
    const id = window.setInterval(tick, 3600);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(clear);
    };
  }, [paused]);

  return (
    <>
      <div className={`wall ${paused ? "paused" : ""}`} aria-hidden="true">
        <div className="wall-track" ref={trackRef}>
          {/* Rendered twice so the upward drift loops seamlessly. */}
          {[0, 1].map((copy) =>
            rows.map((row, i) => <WallRowView key={`${copy}-${i}`} row={row} selected={selected.has(i)} />),
          )}
        </div>
      </div>
      <button
        type="button"
        className="pause-btn"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Play background animation" : "Pause background animation"}
      >
        {paused ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 1.5v11l9-5.5z" fill="currentColor" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 1.5h2.8v11H3zM8.2 1.5H11v11H8.2z" fill="currentColor" />
          </svg>
        )}
      </button>
    </>
  );
}

function WallRowView({ row, selected }: { row: WallRow; selected: boolean }) {
  const pct = Math.round(((row.iv[0] + row.iv[1] + row.iv[2]) / 45) * 100);
  return (
    <div className={`wall-row ${selected ? "sel" : ""}`}>
      <span className="truncate">
        <span className="nm">{row.name}</span>
        {row.flag && <span className={`flag ${row.flag}`}>{row.flag}</span>}
      </span>
      <span className="cp">{row.cp.toLocaleString()} CP</span>
      <span className="ivs">
        {row.iv.map((v, i) => (
          <i key={i} style={{ ["--v" as string]: `${(v / 15) * 100}%` }} />
        ))}
      </span>
      <span>{pct}%</span>
      <span className="truncate">{row.fast}</span>
      <span className="truncate">{row.charged}</span>
    </div>
  );
}

const steps = [
  {
    title: "Log each Pokémon once",
    body: "Type the species, CP and appraisal without touching the mouse. Tab moves between fields and Enter starts the next one. After that, a minute a day keeps up with new catches.",
    visual: (
      <div className="flex flex-wrap items-center gap-1.5">
        {["m", "a", "c"].map((k) => (
          <span key={k} className="keycap">{k}</span>
        ))}
        <span className="keycap">Tab</span>
        <span className="keycap">2814</span>
        <span className="keycap">Tab</span>
        <span className="keycap">15 14 13</span>
        <span className="keycap accent">Enter</span>
      </div>
    ),
  },
  {
    title: "Sort it on a big screen",
    body: "Filter thousands of Pokémon by species, IVs, moves or tags. Shift-click and ctrl-click to select a group, the same way you'd select files on your computer.",
    visual: (
      <div className="space-y-1 text-sm">
        {[
          ["Machamp", "2,814", false],
          ["Machamp", "1,204", true],
          ["Machamp", "987", true],
        ].map(([n, cp, sel], i) => (
          <div
            key={i}
            className={`flex justify-between rounded-md border px-3 py-1.5 ${
              sel ? "border-glow-500/60 bg-glow-500/15 text-ink-100" : "border-ink-800 bg-ink-900 text-ink-300"
            }`}
          >
            <span className="font-semibold">{n}</span>
            <span className="font-display tabular-nums">{cp} CP</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Act on it in the game",
    body: "Shinboku writes a Pokémon GO search string for your selection. Paste it into the game's search bar, and the whole group shows up, ready to transfer or favorite.",
    visual: (
      <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5">
        <code className="flex-1 truncate font-display text-sm text-glow-300">machamp&amp;cp987-1204</code>
        <span className="rounded-md bg-ink-800 px-2 py-1 text-xs font-semibold text-ink-300">Copy</span>
      </div>
    ),
  },
];

function HowItWorks() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <h2 className="font-display max-w-2xl text-4xl leading-tight font-bold text-balance">
        Built for the trainer with a full bag
      </h2>
      <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
        {steps.map((s, i) => (
          <li key={s.title} className="relative border-t border-ink-700 pt-6">
            <span className="absolute -top-px left-0 h-px w-16 bg-linear-to-r from-glow-400 to-ice-400" />
            <p className="font-display text-sm font-semibold text-glow-400">Step {i + 1}</p>
            <h3 className="mt-1 text-xl font-bold">{s.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-300">{s.body}</p>
            <div className="mt-5">{s.visual}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const recs = [
  {
    action: "Transfer",
    tone: "text-rose-300 border-rose-300/40",
    what: "Machamp, 1,204 CP",
    why: "Weaker in every stat than the Machamp you're keeping, and no league rank worth saving.",
  },
  {
    action: "Power up",
    tone: "text-glow-300 border-glow-400/50",
    what: "Rhyperior, 3,016 CP",
    why: "Your strongest Rock attacker by a wide margin, and the next power-ups are cheap.",
  },
  {
    action: "Keep for PvP",
    tone: "text-ice-400 border-ice-400/50",
    what: "Medicham, 1,431 CP",
    why: "Low attack and high bulk make this a great Great League spread, even with a one-star appraisal.",
  },
];

function Recommendations() {
  return (
    <section className="border-y border-ink-800 bg-ink-900/60">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[1fr_1.3fr] lg:items-center">
        <div>
          <h2 className="font-display text-4xl leading-tight font-bold">Every suggestion says why</h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-300">
            Shinboku looks across your whole bag and points out what to transfer, power up, evolve and
            keep for battle. Each one comes with a reason you can check, and nothing happens until you
            decide.
          </p>
        </div>
        <ul className="space-y-3">
          {recs.map((r) => (
            <li key={r.what} className="flex gap-4 rounded-xl border border-ink-800 bg-ink-950/70 p-5">
              <span
                className={`font-display h-fit shrink-0 rounded-md border px-2.5 py-1 text-sm font-semibold ${r.tone}`}
              >
                {r.action}
              </span>
              <div>
                <p className="font-bold">{r.what}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-300">{r.why}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Footer({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="mx-auto max-w-7xl px-6 py-20">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2 className="font-display text-3xl font-bold">Start with the Pokémon you caught today.</h2>
          <p className="mt-2 text-ink-300">Free, and your bag stays private to your account.</p>
        </div>
        <Link
          to={signedIn ? "/bag" : "/signin"}
          className="rounded-lg bg-linear-to-r from-glow-400 to-ice-400 px-6 py-3.5 font-bold text-ink-950 hover:brightness-110"
        >
          {signedIn ? "Open your bag" : "Create a free account"}
        </Link>
      </div>
      <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-ink-800 pt-6 text-xs text-ink-400">
        <p className="max-w-2xl">
          Shinboku is a fan project and isn't affiliated with Niantic, Nintendo, The Pokémon Company or
          Game Freak. It never connects to your game account.
        </p>
        <a href="https://github.com/KamiNoTe14/shinboku" className="hover:text-ink-100">
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}
