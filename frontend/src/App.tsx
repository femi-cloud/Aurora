import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { useNavigate, BrowserRouter, Routes, Route } from "react-router-dom";
import { Snapshot } from "./components/Snapshot";
import { Timeline } from "./components/Timeline";
import { RegionalBreakdown } from "./components/RegionalBreakdown";
import { Anomalies } from "./components/Anomalies";
import { RecommendationsPanel } from "./components/RecommendationsPanel";
import { NaturalQuery } from "./components/NaturalQuery";
import { DropoffPredictor } from "./components/DropoffPredictor";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { MarqueeLights } from "./components/MarqueeLights";
import { MarqueeTicker } from "./components/MarqueeTicker";
import { Scene3D } from "./components/Scene3D";
import { DecisionHistory } from "./components/DecisionHistory";
import { TitleDetail } from "./components/TitleDetail";
import { SettingsPage } from "./components/SettingsPage";



const AURORA_LETTERS = [
  { char: "A", x: -18, y: -14, r: -14 },
  { char: "u", x: 14, y: 10, r: 10 },
  { char: "r", x: -12, y: 12, r: -8 },
  { char: "o", x: 16, y: -10, r: 12 },
  { char: "r", x: -14, y: 8, r: -10 },
  { char: "a", x: 10, y: -12, r: 8 },
];

const SECTION_ACCENTS = {
  ink: "bg-ink",
  scope: "bg-scope",
  tally: "bg-tally",
  marquee: "bg-marquee",
} as const;

function SectionHeading({
  children,
  index,
  accent = "ink",
}: {
  children: React.ReactNode;
  index: number;
  accent?: keyof typeof SECTION_ACCENTS;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold font-sans text-void shrink-0 ${SECTION_ACCENTS[accent]}`}
      >
        {String(index).padStart(2, "0")}
      </span>
      <h2 className="text-lg font-bold font-display tracking-tight text-ink">
        {children}
      </h2>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState<"2d" | "3d" | "history">("2d");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0);

  const navigate = useNavigate();

  function setModeWithTransition(next: typeof mode) {
  if (next === mode) return;
  setIsTransitioning(true);
  setOverlayOpacity(1);
  setTimeout(() => {
    setMode(next);
    setOverlayOpacity(0);
    setTimeout(() => setIsTransitioning(false), 300);
  }, 300);
}

  return (
    <div className="min-h-screen bg-void text-ink px-6 py-8 lg:px-10 max-w-[1600px] mx-auto">
      <div className="mb-10 pb-6 border-b border-border">
        <div
          className="border rounded-2xl px-8 py-5 bg-surface/40"
          style={{ animation: "border-breathe 7s ease-in-out infinite" }}
        >
          <MarqueeLights count={16} size="sm" />

          <div className="flex items-center justify-between my-3">
            <div className="flex items-baseline gap-3">
              <h1
                className="text-3xl font-bold tracking-tight font-display flex text-marquee"
                style={{ animation: "neon-flicker 5s ease-in-out infinite" }}
              >
                {AURORA_LETTERS.map((l, i) => (
                  <span
                    key={i}
                    className="inline-block"
                    style={
                      {
                        animation: "letter-settle 0.6s cubic-bezier(0.22,1,0.36,1) forwards",
                        animationDelay: `${i * 200}ms`,
                        opacity: 0,
                        "--lx": `${l.x}px`,
                        "--ly": `${l.y}px`,
                        "--lr": `${l.r}deg`,
                      } as React.CSSProperties
                    }
                  >
                    {l.char}
                  </span>
                ))}
              </h1>
              <span className="text-xs font-semibold text-muted-foreground tracking-wide [font-variant-caps:all-small-caps]">
                Control Room
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2 text-sm text-marquee">
                <MarqueeLights count={3} size="sm" />
                Live
              </span>

              <div className="flex items-center gap-1 font-mono text-xs [font-variant-caps:all-small-caps]">
                {(["2d", "3d", "history"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setModeWithTransition(m)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      mode === m
                        ? "bg-marquee/15 text-marquee"
                        : "text-muted-foreground hover:text-marquee"
                    }`}
                  >
                    {m === "2d" ? "Dashboard" : m === "3d" ? "Screening Room" : "History"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => navigate("/settings")}
                className="text-muted-foreground hover:text-marquee transition-colors"
                aria-label="Settings"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
              <ThemeSwitch />
            </div>
          </div>

          <MarqueeTicker />
        </div>
      </div>

      {mode === "3d" ? (
        <Scene3D />
      ) : mode === "history" ? (
        <DecisionHistory />
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <section>
            <SectionHeading index={1} accent="scope">Signal</SectionHeading>
            <Timeline />
            <RegionalBreakdown />
          </section>

          <section>
            <SectionHeading index={2} accent="tally">Detection</SectionHeading>
            <Anomalies />
          </section>
        </div>

        <div className="border-t border-border pt-8 mb-10">
          <SectionHeading index={3} accent="marquee">Decision</SectionHeading>
          <div className="max-h-125 overflow-y-auto custom-scrollbar pr-2">
            <RecommendationsPanel />
          </div>
        </div>

        <div className="border-t border-border pt-8 mb-10">
          <SectionHeading index={4} accent="ink">Explore</SectionHeading>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <NaturalQuery />
            <DropoffPredictor />
          </div>
        </div>

        <div className="border-t border-border pt-8">
          <SectionHeading index={5} accent="ink">Detail</SectionHeading>
          <Snapshot />
        </div>
      </>
      )}
      {isTransitioning && (
        <div
          className="fixed inset-0 z-50 bg-void pointer-events-none transition-opacity duration-300"
          style={{ opacity: overlayOpacity }}
        />
      )}
    </div>
  );
}

export default function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/titles/:titleId" element={<TitleDetail />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}