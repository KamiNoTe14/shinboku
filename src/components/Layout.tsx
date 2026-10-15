import { NavLink, Outlet, Link } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import { Logo } from "./Logo";

type NavItem = { to: string; label: string; icon: keyof typeof icons; private?: boolean };

const nav: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Your bag",
    items: [
      { to: "/bag", label: "Bag", icon: "bag", private: true },
      { to: "/catch-up", label: "Catch up", icon: "checklist", private: true },
      { to: "/recommendations", label: "Recommendations", icon: "spark", private: true },
    ],
  },
  {
    heading: "Tools",
    items: [
      { to: "/pokedex", label: "Pokédex", icon: "book" },
      { to: "/raids", label: "Raid counters", icon: "target" },
    ],
  },
];

export default function Layout() {
  const { user } = useAuth();

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
        <Link to="/" className="px-5 pt-5 pb-6">
          <Logo />
        </Link>

        <nav className="flex-1 space-y-6 px-3">
          {nav.map((group) => (
            <div key={group.heading}>
              <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
                {group.heading}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition ${
                          isActive
                            ? "bg-navy text-ink-100"
                            : "text-ink-300 hover:bg-ink-800 hover:text-ink-100"
                        }`
                      }
                    >
                      <Icon name={item.icon} />
                      <span className="flex-1">{item.label}</span>
                      {item.private && !user && <Icon name="lock" className="text-ink-600" />}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-800 p-3">
          {user ? (
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <Avatar name={user.displayName || user.email || "?"} photo={user.photoURL} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.displayName || "Trainer"}</p>
                <p className="truncate text-xs text-ink-400">{user.email}</p>
              </div>
              <button
                onClick={() => signOut(auth)}
                title="Sign out"
                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
              >
                <Icon name="logout" />
              </button>
            </div>
          ) : (
            <Link
              to="/signin"
              className="block rounded-lg bg-linear-to-r from-glow-400 to-ice-400 px-3 py-2 text-center text-sm font-bold text-ink-950 hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  if (photo) {
    return <img src={photo} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />;
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-sm font-bold">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

const icons = {
  bag: "M6 7h12l-1 13H7L6 7Zm3 0a3 3 0 0 1 6 0",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h10",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",
  checklist: "M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9Z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
};

function Icon({ name, className = "" }: { name: keyof typeof icons; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[name]} />
    </svg>
  );
}
