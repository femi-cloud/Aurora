import { useState, useEffect } from "react";
import { API_BASE_URL } from "../api/client.ts";
import { useTitles } from "../hooks/useTitles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadialGauge } from "./RadialGauge";



const REGIONS = ["NA", "EU", "WA", "SA", "APAC"];
const DEVICES = ["mobile", "desktop", "tv", "tablet"];

interface PredictionResult {
  title_id: string;
  region: string;
  device: string;
  drop_off_probability: number;
}

export function DropoffPredictor() {
  const { titles, loading: titlesLoading } = useTitles();
  const [titleId, setTitleId] = useState("");
  const [region, setRegion] = useState(REGIONS[0]);
  const [device, setDevice] = useState(DEVICES[0]);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!titleId && titles.length > 0) setTitleId(titles[0].title_id);
  }, [titles, titleId]);

  async function handlePredict() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({ titleId, region, device });
      const res = await fetch(`${API_BASE_URL}/api/predict/dropoff?${params}`);
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

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold font-display tracking-tight text-ink mb-4">Drop-off prediction simulator (XGBoost)</h2>

      <div className="flex gap-3 mb-4 flex-wrap">
        <Select
          value={titleId}
          onValueChange={(value) => {
            if (value) setTitleId(value);
          }}
          disabled={titlesLoading}
        >
          <SelectTrigger className="w-55 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors disabled:opacity-50">
            <SelectValue placeholder={titlesLoading ? "Loading titles..." : undefined}>
              {titles.find((t) => t.title_id === titleId)?.title_name ?? titleId}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-surface border-border rounded-lg shadow-xl">
            {titles.map((t) => (
              <SelectItem
                key={t.title_id}
                value={t.title_id}
                className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
              >
                {t.title_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={region}
          onValueChange={(value) => {
            if (value) setRegion(value);
          }}
        >
          <SelectTrigger className="w-30 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface border-border rounded-lg shadow-xl">
            {REGIONS.map((r) => (
              <SelectItem
                key={r}
                value={r}
                className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
              >
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={device}
          onValueChange={(value) => {
            if (value) setDevice(value);
          }}
        >
          <SelectTrigger className="w-35 bg-surface border-border font-mono text-sm rounded-lg hover:border-marquee/50 transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface border-border rounded-lg shadow-xl">
            {DEVICES.map((d) => (
              <SelectItem
                key={d}
                value={d}
                className="font-mono text-sm rounded-md focus:bg-marquee/10 focus:text-marquee data-[state=checked]:text-marquee data-[state=checked]:font-semibold"
              >
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          onClick={handlePredict}
          disabled={loading}
          className="border border-marquee/50 bg-marquee/10 hover:bg-marquee/20 disabled:border-border disabled:bg-transparent disabled:text-muted-foreground text-marquee font-mono text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          {loading ? "..." : "Predict"}
        </button> 
      </div>

      {error && <p className="text-tally">Error: {error}</p>}

      {result && (
        <div className="bg-surface border border-border rounded-lg p-4 flex items-center gap-4">
          <RadialGauge percentage={percentage ?? 0} size={72} />
          <p className="text-sm text-muted-foreground">
            Drop-off probability for {titles.find((t) => t.title_id === titleId)?.title_name} · {region} · {device}
          </p>
        </div>
      )}
    </div>
  );
}