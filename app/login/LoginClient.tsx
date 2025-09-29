// app/login/LoginClient.tsx
'use client';

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginClient({ callbackUrl = "/r/south_rockies" }: { callbackUrl?: string }) {
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-svh bg-black text-white flex items-center justify-center">
      <div className="w-full max-w-sm p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-4">
        <div className="flex justify-center">
          <Image src="/images/slopelabs_inverse_transparent.svg" alt="Slope Labs" width={240} height={60} priority />
        </div>
        <h1 className="text-xl font-semibold text-center">Sign in to Slope Labs</h1>

        {/* Google SSO */}
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl })}
          className="w-full px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition"
        >
          Continue with Google
        </button>

        <div className="text-center text-xs text-neutral-500">
          If the button doesn’t redirect,{" "}
          <a
            className="underline"
            href={`/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          >
            click here
          </a>.
        </div>

        <div className="text-center text-xs text-neutral-500">— or —</div>

        {/* Optional email magic link (works when EMAIL_* envs are set) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            signIn("email", { email, callbackUrl });
          }}
          className="space-y-2"
        >
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
            className="w-full px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition"
          >
            Continue with Email
          </button>
          <p className="text-[11px] text-neutral-500 text-center">
            We’ll send a sign-in link to your email.
          </p>
        </form>
      </div>
    </div>
  );
}
