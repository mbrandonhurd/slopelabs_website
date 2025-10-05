// components/RegionSwitcher.tsx
'use client';

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function RegionSwitcher() {
  const [regions, setRegions] = useState<string[]>([]);
  const [value, setValue] = useState<string>("");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/regions", { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (Array.isArray(data.regions)) {
          setRegions(data.regions);
        } else {
          setRegions([]);
        }
      } catch (err) {
        if (active) {
          console.error("[RegionSwitcher] failed to load regions", err);
          setRegions([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!regions.length) return;
    const match = pathname?.match(/^\/r\/([^/?#]+)/);
    const current = match?.[1] ?? "";
    if (current && regions.includes(current)) {
      setValue(current);
    }
  }, [pathname, regions]);

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        if (next) router.push(`/r/${next}`);
      }}
      className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black"
    >
      <option value="" disabled>Select region…</option>
      {regions.map((r) => (
        <option key={r} value={r}>
          {r.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}
