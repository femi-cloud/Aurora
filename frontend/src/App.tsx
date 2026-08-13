import { Snapshot } from "./components/Snapshot";
import { Timeline } from "./components/Timeline";
import { RegionalBreakdown } from "./components/RegionalBreakdown";
import { Anomalies } from "./components/Anomalies";
import { RecommendationsPanel } from "./components/RecommendationsPanel";

function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">Aurora — Dashboard</h1>
      <RecommendationsPanel />
      <Snapshot />
      <Timeline />
      <RegionalBreakdown />
      <Anomalies />
    </div>

    
  );
}

export default App;