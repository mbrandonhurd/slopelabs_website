'use client';
import { useEffect, useRef } from 'react';

export default function MapPanel({ tilesBase, quicklook }: { tilesBase?: string; quicklook?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: any;
    (async () => {
      if (!ref.current) return;
      const maplibregl = await import('maplibre-gl');
      await import('maplibre-gl/dist/maplibre-gl.css');
      map = new maplibregl.Map({
        container: ref.current,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [-116, 51],
        zoom: 5.5
      });
      map.on('load', () => {
        if (tilesBase) {
          map.addSource('overlay', { type: 'raster', tiles: [`${tilesBase}{z}/{x}/{y}.png`], tileSize: 256 });
          map.addLayer({ id: 'overlay', type: 'raster', source: 'overlay', paint: { 'raster-opacity': 0.6 } });
        }
      });
    })();
    return () => { if (map) map.remove(); };
  }, [tilesBase]);
  return <div ref={ref} className="h-[420px] rounded-lg overflow-hidden border" />;
}
