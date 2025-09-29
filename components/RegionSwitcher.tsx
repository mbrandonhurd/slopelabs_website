'use client';
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function RegionSwitcher() {
  const [regions, setRegions] = useState<string[]>([]);
  const [value, setValue] = useState<string>("");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/regions").then(r => r.json()).then(d => setRegions(d.regions || []));
  }, []);

  useEffect(() => {
    // if you're on /r/<region>, preselect it
    const m = pathname?.match(/^\/r\/([^/?#]+)/);
    if (m?.[1]) setValue(m[1]);
  }, [pathname]);

  return (
    <select
      value={value}
      onChange={(e) => {
        const r = e.target.value;
        setValue(r);
        router.push(`/r/${r}`);
      }}
      className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm"
    >
      <option value="" disabled>Select region…</option>
      {regions.map(r => <option key={r} value={r}>{r.replaceAll("_"," ")}</option>)}
    </select>
  );
}
