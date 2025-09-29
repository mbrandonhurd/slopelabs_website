// app/login/LoginClient.tsx
'use client';

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useCallback, useMemo, useState } from "react";

type Mode = "signin" | "signup";

export default function LoginClient({ callbackUrl = "/r/south_rockies" }: { callbackUrl?: string }) {
  // shared state
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const emailValid = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);
  const passwordValid = useMemo(() => password.length >= 8, [password]);
  const canPasswordAuth =
    emailValid && passwordValid && (mode === "signin" || (mode === "signup" && name.trim().length > 0));

  const onGoogle = useCallback(() => {
    setErr(null); setNote(null);
    signIn("google", { callbackUrl });
  }, [callbackUrl]);

  const onMagicLink = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setNote(null);
    if (!emailValid) return setErr("Enter a valid email.");
    setLoading(true);
    try {
      // NextAuth Email provider flow (requires EMAIL_SERVER/EMAIL_FROM envs)
      await signIn("email", { email, callbackUrl });
      setNote("Check your inbox for the sign-in link.");
    } catch {
      setErr("Could not send magic link. Try again.");
    } finally {
      setLoading(false);
    }
  }, [email, emailValid, callbackUrl]);

  const onPasswordSignIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setNote(null);
    if (!canPasswordAuth) return setErr("Enter a valid email and an 8+ char password.");
    setLoading(true);
    try {
      // Credentials provider (must exist in NextAuth config)
      const r = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: true,  // let NextAuth do the redirect on success
      });
      // If redirect:false, you'd check r?.ok / r?.error
    } catch {
      setErr("Email or password is incorrect.");
      setLoading(false);
    }
  }, [email, password, canPasswordAuth, callbackUrl]);

  const onSignUp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setNote(null);
    if (!canPasswordAuth) return setErr("Enter name, a valid email, and an 8+ char password.");
    setLoading(true);
    try {
      // Your register endpoint should create a user & hashed password.
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || "Could not create account.");
        setLoading(false);
        return;
      }
      // Optional: if you require verification, show note and stop here.
      // setNote("Account created. Check your email to verify, then sign in.");
      // setLoading(false); setMode("signin"); return;

      // Otherwise, auto sign-in after sign-up:
      const r = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: true,
      });
    } catch {
      setErr("Could not create account. Try again.");
      setLoading(false);
    }
  }, [email, password, name, canPasswordAuth, callbackUrl]);

  return (
    <div className="min-h-svh bg-black text-white flex items-center justify-center">
      <div className="w-full max-w-sm p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-4">
        <div className="flex justify-center">
          <Image
            src="/images/slopelabs_inverse_transparent.svg"
            alt="Slope Labs"
            width={240}
            height={60}
            priority
            unoptimized
          />
        </div>

        <h1 className="text-xl font-semibold text-center">Welcome to Slope Labs</h1>

        {/* Tabs: Sign in / Sign up */}
        <div className="grid grid-cols-2 text-sm rounded-lg overflow-hidden border border-neutral-800">
          <button
            type="button"
            onClick={() => { setMode("signin"); setErr(null); setNote(null); }}
            className={`py-2 ${mode === "signin" ? "bg-white text-black" : "bg-neutral-950 text-neutral-300 hover:bg-neutral-900"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setErr(null); setNote(null); }}
            className={`py-2 ${mode === "signup" ? "bg-white text-black" : "bg-neutral-950 text-neutral-300 hover:bg-neutral-900"}`}
          >
            Sign up
          </button>
        </div>

        {/* Google SSO */}
        <button
          type="button"
          onClick={onGoogle}
          disabled={loading}
          className="w-full px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition disabled:opacity-60"
        >
          Continue with Google
        </button>
        <div className="text-center text-xs text-neutral-500">
          If the button doesn’t redirect,{" "}
          <a className="underline" href={`/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
            click here
          </a>.
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <div className="h-px bg-neutral-800 flex-1" />
          <span>or use your email</span>
          <div className="h-px bg-neutral-800 flex-1" />
        </div>

        {/* Email + Password auth */}
        <form
          onSubmit={mode === "signin" ? onPasswordSignIn : onSignUp}
          className="space-y-2"
        >
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md px-3 py-2 bg-black border border-neutral-700 outline-none focus:border-neutral-400"
            />
          )}

          <input
            type="email"
            required
            placeholder="you@slopelabs.ai"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md px-3 py-2 bg-black border border-neutral-700 outline-none focus:border-neutral-400"
          />

          <input
            type="password"
            required
            placeholder={mode === "signup" ? "Create a password (min 8 chars)" : "Your password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md px-3 py-2 bg-black border border-neutral-700 outline-none focus:border-neutral-400"
          />

          <button
            type="submit"
            disabled={loading || !canPasswordAuth}
            className="w-full px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition disabled:opacity-60"
          >
            {mode === "signin" ? "Continue with Email & Password" : "Create account"}
          </button>
        </form>

        {/* Optional: Magic link as a secondary path */}
        <details className="text-xs text-neutral-400">
          <summary className="cursor-pointer select-none">Or get a magic sign-in link</summary>
          <form onSubmit={onMagicLink} className="space-y-2 mt-2">
            <input
              type="email"
              required
              placeholder="you@slopelabs.ai"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md px-3 py-2 bg-black border border-neutral-700 outline-none focus:border-neutral-400"
            />
            <button
              type="submit"
              disabled={loading || !emailValid}
              className="w-full px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition disabled:opacity-60"
            >
              Email me a link
            </button>
          </form>
        </details>

        {/* Notes / Errors */}
        {note && <div className="text-xs text-emerald-400">{note}</div>}
        {err && <div className="text-xs text-red-400">{err}</div>}

        {/* Tiny footer */}
        <p className="text-[11px] text-neutral-500 text-center">
          By continuing, you agree to the Slope Labs Terms & Privacy.
        </p>
      </div>
    </div>
  );
}
