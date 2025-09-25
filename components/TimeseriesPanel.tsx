'use client';
import dynamic from 'next/dynamic';
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function TimeseriesPanel({ region }: { region: string }) {
  // Demo series (replace with station data)
  const x = Array.from({length: 48}, (_, i) => i);
  const temp = x.map(i => Math.sin(i/7) * 5 +  -3 + (i/48)*3);
  const wind = x.map(i => Math.cos(i/9) * 2 + 5);
  const apcp = x.map(i => (i%6===0? Math.random()*5 : 0));

  return (
    <div className="card">
      <div className="card-h"><h3 className="font-medium">Time Series (demo)</h3></div>
      <div className="card-c">
        <Plot
          data={[
            { x, y: temp, name: "Temp (°C)", type: "scatter", mode: "lines" },
            { x, y: wind, name: "Wind (m/s)", type: "scatter", mode: "lines", yaxis: "y2" },
            { x, y: apcp, name: "Precip (mm)", type: "bar", yaxis: "y3" }
          ]}
          layout={{
            height: 320,
            margin: { l: 40, r: 40, t: 10, b: 30 },
            xaxis: { title: "Hour (relative)" },
            yaxis: { title: "Temp" },
            yaxis2: { overlaying: "y", side: "right", title: "Wind" },
            yaxis3: { overlaying: "y", side: "right", position: 1.0, title: "Precip", showgrid: false }
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
