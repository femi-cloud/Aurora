import { Snapshot } from "./components/Snapshot";
import { Timeline } from "./components/Timeline";
import { RegionalBreakdown } from "./components/RegionalBreakdown";
import { Anomalies } from "./components/Anomalies";
import { RecommendationsPanel } from "./components/RecommendationsPanel";
import { NaturalQuery } from "./components/NaturalQuery";
import { DropoffPredictor } from "./components/DropoffPredictor";

function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Aurora — Dashboard</h1>
        <span className="flex items-center gap-2 text-sm text-green-400">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Live
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Signal
          </h2>
          <Timeline />
          <RegionalBreakdown />
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Decision
          </h2>
          <div className="max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
            <RecommendationsPanel />
          </div>
          <Anomalies />
        </section>
      </div>

      <div className="border-t border-slate-800 pt-8 mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
          Explore
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <NaturalQuery />
          <DropoffPredictor />
        </div>
      </div>

      <div className="border-t border-slate-800 pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
          Detail
        </h2>
        <Snapshot />
      </div>
    </div>
  );
}

export default App;