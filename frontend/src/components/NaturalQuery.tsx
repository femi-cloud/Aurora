import { useState } from "react";

interface NaturalQueryResult {
  question: string;
  sql: string;
  explanation: string;
  rows: unknown[];
  answer: string;
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
      const res = await fetch("http://localhost:3000/api/query/natural", {
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
          className="flex-1 bg-slate-800 text-white border border-slate-700 rounded px-4 py-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-6 py-2 rounded"
        >
          {loading ? "..." : "Ask"}
        </button>
      </form>

      {error && <p className="text-red-400 mb-4">Error: {error}</p>}

      {result && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-lg mb-3">{result.answer}</p>

          <button
            onClick={() => setShowSql(!showSql)}
            className="text-sm text-blue-400 hover:underline"
          >
            {showSql ? "Hide" : "Show"} generated SQL query
          </button>

          {showSql && (
            <div className="mt-3 bg-slate-900 rounded p-3">
              <p className="text-sm text-slate-400 mb-2">{result.explanation}</p>
              <pre className="text-xs text-green-400 overflow-x-auto">{result.sql}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}