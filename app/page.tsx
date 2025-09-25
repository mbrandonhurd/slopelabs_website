export default function Home() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Welcome</h2>
      <p className="text-gray-700">This pro template includes auth guards, map & charts, manifest polling, and an admin skeleton.</p>
      <div className="card">
        <div className="card-c">
          <a className="btn" href="/r/south_rockies">Open South Rockies</a>
          <a className="btn ml-2" href="/admin">Open Admin (requires login)</a>
        </div>
      </div>
    </div>
  );
}
