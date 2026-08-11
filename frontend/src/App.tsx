import { RecommendationsPanel } from "./components/RecommendationsPanel";
import "./App.css";

function App() {
  return (
    <>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Aurora</h1>
          <p className="text-muted-foreground">
            Live audience signal, agent recommendations.
          </p>
        </header>

        <main>
          <RecommendationsPanel />
          {/* Person A's data components (timeline, charts by region/title) go here too */}
        </main>
      </div>
    </>
  );
}

export default App;