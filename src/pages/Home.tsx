import { Link } from "react-router";
import { useAuth } from "../auth/AuthProvider";

const features = [
  {
    title: "Built for a keyboard",
    body: "Enter a Pokémon in a few keystrokes: autocomplete species, type appraisals as 15 14 13, and flag shiny or lucky with a single key.",
  },
  {
    title: "Your whole bag on one screen",
    body: "Sort and filter thousands of Pokémon in a dense table. Shift-click and ctrl-click to select groups, just like a file manager.",
  },
  {
    title: "Recommendations with reasons",
    body: "See what to transfer, power up, evolve, and bring to raids, each with a one-line explanation you can check.",
  },
  {
    title: "Back to the game in one paste",
    body: "Select Pokémon here and Shinboku writes the in-game search string, so you can act on the whole group in a few taps.",
  },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-4xl px-8 py-16">
      <p className="text-xs font-semibold tracking-wider text-glow-400 uppercase">
        Pokémon GO companion
      </p>
      <h1 className="mt-3 max-w-2xl text-4xl leading-tight font-extrabold tracking-tight">
        Manage a 2,000-Pokémon bag without scrolling on your phone.
      </h1>
      <p className="mt-4 max-w-xl text-ink-300">
        Shinboku is a desktop-first bag manager. Log your Pokémon once, keep it current in a minute a
        day, and let it tell you what to keep, power up, and bring to the next raid.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          to={user ? "/bag" : "/signin"}
          className="rounded-lg bg-linear-to-r from-glow-400 to-ice-400 px-4 py-2.5 text-sm font-bold text-ink-950 hover:brightness-110"
        >
          {user ? "Open your bag" : "Get started"}
        </Link>
        <Link
          to="/pokedex"
          className="rounded-lg border border-ink-700 px-4 py-2.5 text-sm font-semibold text-ink-100 hover:bg-ink-800"
        >
          Browse the Pokédex
        </Link>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-ink-800 bg-ink-900/60 p-5">
            <h2 className="font-bold">{f.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{f.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-14 text-xs text-ink-400">
        Shinboku is a fan project and is not affiliated with Niantic, Nintendo, The Pokémon Company,
        or Game Freak. It never connects to your game account.
      </p>
    </div>
  );
}
