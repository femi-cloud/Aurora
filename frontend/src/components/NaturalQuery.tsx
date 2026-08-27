import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api/client.ts";

interface NaturalQueryResult {
  question: string;
  sql: string;
  explanation: string;
  rows: unknown[];
  answer: string;
}

interface NaturalQueryProps {
  initialQuery?: string;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

export function NaturalQuery({ initialQuery }: NaturalQueryProps = {}) {
  const [question, setQuestion] = useState(initialQuery ?? "");
  const [result, setResult] = useState<NaturalQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  async function runQuery(q: string) {
    if (!q.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/query/natural`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error ?? `Erreur ${res.status}`);
      }
      const data: NaturalQueryResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runQuery(question);
  }

  // Auto-submits once on mount when the component is opened with a
  // pre-filled question (e.g. "Ask about this title" from TitleDetail).
  useEffect(() => {
    if (initialQuery) {
      setQuestion(initialQuery);
      runQuery(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold font-display tracking-tight text-ink mb-4">Ask a question</h2>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="E.g. Which title has the most drop-off in EU?"
          className="flex-1 bg-surface text-ink border border-border rounded-lg px-4 py-2 font-mono text-sm focus:outline-none focus:border-marquee/50 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="border border-marquee/50 bg-marquee/10 hover:bg-marquee/20 disabled:border-border disabled:bg-transparent disabled:text-muted-foreground text-marquee font-mono text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          {loading ? "..." : "Ask"}
        </button>
      </form>

      {error && <p className="text-tally mb-4">Error: {error}</p>}

      {result && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-lg mb-3">{renderInline(result.answer)}</p>

          <button
            onClick={() => setShowSql(!showSql)}
            className="text-sm text-scope hover:underline"
          >
            {showSql ? "Hide" : "Show"} generated SQL query
          </button>

          {showSql && (
            <div className="mt-3 bg-void rounded-lg p-3">
              <p className="text-sm text-muted-foreground mb-2">{renderInline(result.explanation)}</p>
              <pre className="text-xs text-scope overflow-x-auto font-mono">{result.sql}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}