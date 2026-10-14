import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth, googleProvider } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";
import { Logo } from "../components/Logo";

type Mode = "signin" | "signup" | "reset";

function friendlyError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "That email and password don't match an account.";
      case "auth/email-already-in-use":
        return "An account with that email already exists. Try signing in.";
      case "auth/weak-password":
        return "Passwords need at least 6 characters.";
      case "auth/invalid-email":
        return "That doesn't look like a valid email address.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "";
      case "auth/popup-blocked":
        return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
      case "auth/too-many-requests":
        return "Too many attempts. Wait a minute and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

export default function SignIn() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/bag";

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = () =>
    run(async () => {
      await signInWithPopup(auth, googleProvider);
      navigate(from, { replace: true });
    });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "reset") {
      return run(async () => {
        await sendPasswordResetEmail(auth, email);
        setNotice("If that email has an account, a reset link is on its way.");
      });
    }
    return run(async () => {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate(from, { replace: true });
    });
  };

  const title =
    mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back";

  const input =
    "w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-400 focus:border-glow-500 focus:outline-none";

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo size="lg" />
        </Link>

        <div className="rounded-2xl border border-ink-800 bg-ink-900/70 p-7 shadow-xl shadow-black/30">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {mode === "reset"
              ? "Enter your email and we'll send you a reset link."
              : "Your bag is private to your account."}
          </p>

          {mode !== "reset" && (
            <>
              <button
                type="button"
                onClick={onGoogle}
                disabled={busy}
                className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg border border-ink-700 bg-ink-100 px-3 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white disabled:opacity-60"
              >
                <GoogleMark />
                Continue with Google
              </button>
              <div className="my-5 flex items-center gap-3 text-xs text-ink-400">
                <span className="h-px flex-1 bg-ink-800" />
                or use email
                <span className="h-px flex-1 bg-ink-800" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className={mode === "reset" ? "mt-6 space-y-3" : "space-y-3"}>
            {mode === "signup" && (
              <input
                className={input}
                placeholder="Trainer name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
              />
            )}
            <input
              className={input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            {mode !== "reset" && (
              <input
                className={input}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={6}
                required
              />
            )}

            {error && <p className="text-sm text-rose-300">{error}</p>}
            {notice && <p className="text-sm text-glow-300">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-linear-to-r from-glow-400 to-ice-400 px-3 py-2.5 text-sm font-bold text-ink-950 transition hover:brightness-110 disabled:opacity-60"
            >
              {busy
                ? "Working…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset link"
                    : "Sign in"}
            </button>
          </form>

          <div className="mt-5 flex justify-between text-xs text-ink-400">
            {mode === "signin" ? (
              <>
                <button className="hover:text-ink-100" onClick={() => setMode("reset")}>
                  Forgot password?
                </button>
                <button className="hover:text-ink-100" onClick={() => setMode("signup")}>
                  Create an account
                </button>
              </>
            ) : (
              <button className="hover:text-ink-100" onClick={() => setMode("signin")}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
