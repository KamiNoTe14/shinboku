import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="px-8 py-16">
      <h1 className="text-2xl font-extrabold">Page not found</h1>
      <p className="mt-2 text-sm text-ink-400">That page doesn't exist.</p>
      <Link to="/" className="mt-6 inline-block text-sm font-semibold text-moss-400 hover:text-moss-300">
        ← Back home
      </Link>
    </div>
  );
}
