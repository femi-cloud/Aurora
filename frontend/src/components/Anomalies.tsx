import { useEffect, useState } from "react";
import { getAnomalies } from "../api/client";
import type { AnomalyRow } from "../types/audience";

interface AnomalyLogEntry extends AnomalyRow {
  key: string;
  detectedAt: string;
  stillActive: boolean;
}

export function Anomalies() {
  const [log, setLog] = useState<AnomalyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function loadAnomalies() {
      getAnomalies()
        .then((rows: AnomalyRow[]) => {
          const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const activeKeys = new Set(rows.map((r) => `${r.title_id}-${r.region}`));

          setLog((prev) => {
            const updated = new Map(prev.map((e) => [e.key, e]));

            for (const row of rows) {
              const key = `${row.title_id}-${row.region}`;
              const existing = updated.get(key);
              updated.set(key, {
                ...row,
                key,
                detectedAt: existing?.detectedAt ?? now, // garde l'heure de première détection
                stillActive: true,
              });
            }

            // marque comme résolues celles qui ne sont plus dans le poll actuel
            for (const [key, entry] of updated) {
              if (!activeKeys.has(key)) {
                updated.set(key, { ...entry, stillActive: false });
              }
            }

            return Array.from(updated.values())
              .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
              .slice(0, 15); // garde les 15 plus récentes, évite une liste infinie
          });

          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }

    loadAnomalies();
    const interval = setInterval(loadAnomalies, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4">Anomalies détectées</h2>

      {loading && <p>Chargement...</p>}
      {error && <p className="text-red-400">Erreur: {error}</p>}

      {!loading && !error && log.length === 0 && (
        <p className="text-slate-400">Aucune anomalie détectée pour le moment.</p>
      )}

      {!loading && !error && log.length > 0 && (
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
            {log.map((anomaly) => (
            <div
              key={anomaly.key}
              className={`rounded-lg p-4 flex items-center justify-between border ${
                anomaly.stillActive
                  ? "bg-red-950 border-red-800"
                  : "bg-slate-800 border-slate-700 opacity-60"
              }`}
            >
              <div>
                <p className="font-bold flex items-center gap-2">
                  {anomaly.title_name}
                  {anomaly.stillActive ? (
                    <span className="text-xs bg-red-600 px-2 py-0.5 rounded">EN COURS</span>
                  ) : (
                    <span className="text-xs bg-slate-600 px-2 py-0.5 rounded">résolue</span>
                  )}
                </p>
                <p className="text-sm text-slate-400">
                  Région: {anomaly.region} · détecté à {anomaly.detectedAt}
                </p>
              </div>
              <div className="text-right">
                <p className="text-red-400 font-bold">
                  +{Math.round(anomaly.deviation * 100)} pts
                </p>
                <p className="text-sm text-slate-400">
                  {Math.round(anomaly.current_rate * 100)}% vs{" "}
                  {Math.round(anomaly.baseline_rate * 100)}% habituel
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}