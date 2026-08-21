import { useState } from "react";
import { API_BASE_URL } from "../api/client.ts";

interface NaturalQueryResult {
  question: string;
  sql: string;
  explanation: string;
  rows: unknown[];
  answer: string;
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

export function NaturalQuery() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<NaturalQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/query/natural`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
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

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4">Ask a question</h2>

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
          className="bg-marquee hover:bg-marquee/90 disabled:bg-muted disabled:text-muted-foreground text-void font-mono text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
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