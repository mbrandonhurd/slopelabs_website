'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  return (
    <header className="flex items-center justify-between pb-4 border-b">
      <Link href="/" className="text-xl font-semibold">Avalanche UI</Link>
      <nav className="flex items-center gap-4 text-sm text-gray-600">
        <Link className={pathname?.startsWith('/r') ? 'underline' : ''} href="/r/south_rockies">Dashboard</Link>
        <Link className={pathname?.startsWith('/admin') ? 'underline' : ''} href="/admin">Admin</Link>
        <Link className={pathname === '/login' ? 'underline' : ''} href="/login">Login</Link>
      </nav>
    </header>
  );
}
