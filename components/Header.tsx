// components/Header.tsx
'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";
// If you prefer one-click Google SSO, uncomment the next line and the onClick below.
// import { signIn, signOut } from "next-auth/react";

export default function Header() {
  const pathname = usePathname();

  // Hide on the dedicated login page
  if (pathname?.startsWith("/login")) return null;

  // Minimal bar on the landing page "/"
  if (pathname === "/") {
    return (
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-7xl flex items-center justify-end p-4">
          {/* Option A: go to your login screen */}
          <Link
            href="/login"
            className="rounded-lg bg-white text-black px-3 py-1.5 hover:bg-neutral-200 transition"
          >
            Sign in
          </Link>

          {/* Option B (one-click Google SSO). Uncomment if you imported signIn above.
          <button
            onClick={() => signIn('google', { callbackUrl: '/r/south_rockies' })}
            className="rounded-lg bg-white text-black px-3 py-1.5 hover:bg-neutral-200 transition"
          >
            Sign in
          </button>
          */}
        </div>
      </div>
    );
  }

  // Full header on authenticated (protected) pages
  return (
    <header className="flex items-center justify-between pb-4 border-b">
      <Link href="/r/south_rockies" className="text-xl font-semibold">
        Slope Labs
      </Link>
      <nav className="flex items-center gap-4 text-sm text-gray-600">
        <Link
          className={pathname?.startsWith("/r") ? "underline" : ""}
          href="/r/south_rockies"
        >
          Dashboard
        </Link>
        <Link
          className={pathname?.startsWith("/admin") ? "underline" : ""}
          href="/admin"
        >
          Admin
        </Link>
        {/* If you want a sign-out button, uncomment (and import signOut above)
        <button onClick={() => signOut({ callbackUrl: "/" })} className="underline">
          Sign out
        </button>
        */}
      </nav>
    </header>
  );
}
