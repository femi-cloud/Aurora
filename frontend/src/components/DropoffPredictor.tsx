import { useState } from "react";

const TITLES = [
  { id: "aurora-01", name: "Nightfall Protocol" },
  { id: "aurora-02", name: "The Last Reel" },
  { id: "aurora-03", name: "Glass Horizon" },
  { id: "aurora-04", name: "Static Bloom" },
  { id: "aurora-05", name: "Echo Chamber" },
  { id: "aurora-06", name: "Paper Moons" },
];

const REGIONS = ["NA", "EU", "WA", "SA", "APAC"];
const DEVICES = ["mobile", "desktop", "tv", "tablet"];

interface PredictionResult {
  title_id: string;
  region: string;
  device: string;
  drop_off_probability: number;
}

export function DropoffPredictor() {
  const [titleId, setTitleId] = useState(TITLES[0].id);
  const [region, setRegion] = useState(REGIONS[0]);
  const [device, setDevice] = useState(DEVICES[0]);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePredict() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({ titleId, region, device });
      const res = await fetch(`http://localhost:3000/api/predict/dropoff?${params}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data: PredictionResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  const percentage = result ? Math.round(result.drop_off_probability * 100) : null;
  const riskColor =
    percentage === null ? "" : percentage >= 60 ? "text-red-400" : percentage >= 30 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4">Simulateur de prédiction (XGBoost)</h2>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={titleId}
          onChange={(e) => setTitleId(e.target.value)}
          className="bg-slate-800 text-white border border-slate-700 rounded px-3 py-2"
        >
          {TITLES.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="bg-slate-800 text-white border border-slate-700 rounded px-3 py-2"
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={device}
          onChange={(e) => setDevice(e.target.value)}
          className="bg-slate-800 text-white border border-slate-700 rounded px-3 py-2"
        >
          {DEVICES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <button
          onClick={handlePredict}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-6 py-2 rounded"
        >
          {loading ? "..." : "Prédire"}
        </button>
      </div>

      {error && <p className="text-red-400">Erreur: {error}</p>}

      {result && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-sm text-slate-400 mb-1">
            Probabilité de drop-off pour {TITLES.find((t) => t.id === titleId)?.name} · {region} · {device}
          </p>
          <p className={`text-4xl font-bold ${riskColor}`}>{percentage}%</p>
        </div>
      )}
    </div>
  );
}