'use client';
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  async function signIn(role: "pro" | "admin") {
    await fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ role }) });
    router.push("/admin");
  }
  return (
    <div className="max-w-md">
      <h2 className="text-lg font-semibold mb-4">Login (demo)</h2>
      <p className="text-sm text-gray-600 mb-4">This is a demo login that sets a signed cookie. Replace with Auth0/Clerk later.</p>
      <div className="flex gap-2">
        <button onClick={() => signIn("pro")} className="btn">Sign in as Pro</button>
        <button onClick={() => signIn("admin")} className="btn">Sign in as Admin</button>
      </div>
    </div>
  );
}
