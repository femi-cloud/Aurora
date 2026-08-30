import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getSettings, updateSettings, type AgentSettings } from "../api/client";

// Read-only — set via ORCHESTRATOR_INTERVAL_MS in .env, never changes without
// a redeploy. Kept in sync manually with orchestrator.ts's default.
const CYCLE_INTERVAL_MS = 45000;

interface FieldConfig {
  key: keyof AgentSettings;
  label: string;
  hint: string;
  step: number;
  min: number;
}

const FIELDS: FieldConfig[] = [
  {
    key: "anomalyScoreThreshold",
    label: "Anomaly score threshold",
    hint: "Minimum composite score (0–1) before a decision is generated",
    step: 0.1,
    min: 0,
  },
  {
    key: "deviationThreshold",
    label: "Deviation threshold",
    hint: "Minimum drop-off rate deviation from baseline to flag a title/region",
    step: 0.05,
    min: 0,
  },
  {
    key: "baselineWindowMinutes",
    label: "Baseline window (minutes)",
    hint: "How far back to compute the baseline drop-off rate",
    step: 1,
    min: 1,
  },
  {
    key: "recentWindowMinutes",
    label: "Recent window (minutes)",
    hint: "How far back to compute the current drop-off rate",
    step: 1,
    min: 1,
  },
  {
    key: "minViewers",
    label: "Minimum viewers",
    hint: "Ignore title/region pairs below this viewer count",
    step: 1,
    min: 0,
  },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings()
      .then((data) => setSettings(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, []);

  function updateField(key: keyof AgentSettings, value: number) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const data = await updateSettings(settings);
      setSettings(data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-void text-ink px-6 py-8 lg:px-10 max-w-180 mx-auto">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-marquee transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </button>

      <h1 className="text-2xl font-bold font-display tracking-tight text-ink mb-1">
        Settings
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Agent detection parameters — changes apply on the next orchestration cycle.
      </p>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      )}

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 text-red-400 text-sm px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {settings && (
        <div className="border border-border rounded-2xl bg-surface/40 p-6 space-y-6">
          {FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-ink" htmlFor={field.key}>
                {field.label}
              </label>
              <p className="text-xs text-muted-foreground">{field.hint}</p>
              <input
                id={field.key}
                type="number"
                step={field.step}
                min={field.min}
                value={settings[field.key]}
                onChange={(e) => updateField(field.key, Number(e.target.value))}
                className="w-40 rounded-md bg-void border border-border px-3 py-1.5 text-sm font-mono text-ink focus:outline-none focus:ring-1 focus:ring-marquee"
              />
            </div>
          ))}

          <div className="border-t border-border pt-5 flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">
              Cycle interval (ms)
            </span>
            <p className="text-xs text-muted-foreground">
              Set via ORCHESTRATOR_INTERVAL_MS — requires a redeploy to change
            </p>
            <span className="w-40 rounded-md bg-void/50 border border-border px-3 py-1.5 text-sm font-mono text-muted-foreground">
              {CYCLE_INTERVAL_MS}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-md bg-marquee/15 text-marquee text-sm font-semibold hover:bg-marquee/25 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            {saved && (
              <span className="text-xs text-tally">Saved</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}