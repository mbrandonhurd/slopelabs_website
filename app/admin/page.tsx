export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Admin</h2>
      <div className="card"><div className="card-c">
        <p className="text-sm text-gray-700">This area is protected by middleware. Replace with real tools:</p>
        <ul className="list-disc ml-6 text-sm text-gray-700 mt-2">
          <li>Publish / promote manifest</li>
          <li>Reprocess run</li>
          <li>Users & roles</li>
          <li>Audit log</li>
        </ul>
      </div></div>
    </div>
  );
}
