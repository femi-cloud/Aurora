import { Snapshot } from "./components/Snapshot";
import { Timeline } from "./components/Timeline";
import { RegionalBreakdown } from "./components/RegionalBreakdown";
import { Anomalies } from "./components/Anomalies";
import { RecommendationsPanel } from "./components/RecommendationsPanel";
import { NaturalQuery } from "./components/NaturalQuery";
import { DropoffPredictor } from "./components/DropoffPredictor";
import { ThemeSwitch } from "./components/ThemeSwitch";

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
  return (
    <div className="min-h-screen bg-void text-ink px-6 py-8 lg:px-10 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-10 pb-6 border-b border-border">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight font-display flex">
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
          <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-scope [font-variant-caps:all-small-caps]">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-scope opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-scope" />
            </span>
            Live
          </span>
          <ThemeSwitch />
        </div>
      </div>

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
    </div>
  );
}

export default App;