'use client';
import { useEffect, useState } from "react";

type Avy = {
  id?: string | number;
  date?: string;
  location?: string;
  elevationBand?: string; // above_treeline/treeline/below_treeline
  type?: string;          // Storm slab, Wind slab, Persistent slab, Wet loose, etc.
  size?: string;          // e.g., D1, D2
  notes?: string;
};

export default function AvalancheList({ region, initialList }: { region: string; initialList?: Avy[] }) {
  const [list, setList] = useState<Avy[]>(() => initialList ?? []);
  useEffect(() => {
    if (initialList !== undefined) {
      setList(initialList);
      return;
    }

    let cancelled = false;
    fetch(`/api/data/${region}/avalanches`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setList(d.avalanches || []);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      });

    return () => {
      cancelled = true;
    };
  }, [region, initialList]);

  if (!list.length) return null;

  return (
    <div className="card">
      <div className="card-h"><h3 className="font-medium">Recent Avalanches</h3></div>
      <div className="card-c space-y-2">
        {list.map((a, i) => (
          <div key={a.id ?? i} className="text-sm">
            <div className="font-medium">{a.date} — {a.location} {a.size ? `(${a.size})` : ""}</div>
            <div className="text-neutral-600">
              {a.type} {a.elevationBand ? `• ${a.elevationBand.replaceAll("_"," ")}` : ""}{a.notes ? ` — ${a.notes}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
