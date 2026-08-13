import { useEffect, useState } from "react";
import { getSnapshot } from "../api/client";
import type { SnapshotRow } from "../types/audience";

export function Snapshot() {
  const [data, setData] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function loadSnapshot() {
        getSnapshot()
        .then(setData)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }

    loadSnapshot(); // premier chargement immédiat
    const interval = setInterval(loadSnapshot, 5000); // puis toutes les 5s

    return () => clearInterval(interval); // nettoyage quand le composant se démonte
  }, []);

  if (loading) return <p className="text-white">Chargement...</p>;
  if (error) return <p className="text-red-400">Erreur: {error}</p>;

  return (
    <table className="w-full text-white border-collapse">
      <thead>
        <tr className="border-b border-slate-700 text-left">
          <th className="p-2">Titre</th>
          <th className="p-2">Région</th>
          <th className="p-2">Viewers</th>
          <th className="p-2">Drop-off</th>
          <th className="p-2">Durée moy. (s)</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} className="border-b border-slate-800">
            <td className="p-2">{row.title_name}</td>
            <td className="p-2">{row.region}</td>
            <td className="p-2">{row.viewer_count}</td>
            <td className="p-2">{row.drop_off_count}</td>
            <td className="p-2">{Math.round(row.avg_seconds_watched)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}