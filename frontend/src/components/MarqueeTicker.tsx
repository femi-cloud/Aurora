import { useEffect, useState } from "react";
import { useTitles } from "../hooks/useTitles";

const REVEAL_DELAY_MS = 2000; // Delay before revealing the title count in the ticker 

export function MarqueeTicker() {
  const { titles, loading } = useTitles();
  const [timerElapsed, setTimerElapsed] = useState(false);

  useEffect(() => {
      const timer = setTimeout(() => setTimerElapsed(true), REVEAL_DELAY_MS);
      return () => clearTimeout(timer);
  }, []);

  const revealed = timerElapsed && !loading;
  const titleCount = revealed ? titles.length : 0;

  function renderTicker(keyPrefix: string) {
      return (
          <span key={keyPrefix}>
              Now screening   ●   Live audience data   ●{" "}
              <span
                  className="inline-block transition-all duration-500 ease-out"
                  style={{
                      opacity: revealed ? 1 : 0.5,
                      transform: revealed ? "scale(1)" : "scale(0.85)",
                      textShadow: revealed ? "0 0 6px var(--color-marquee)" : "none",
                  }}
              >
                  {titleCount} titles tracked
              </span>
              {"   ●   "}Real-time anomaly detection
          </span>
      );
  }

  return (
    <div className="overflow-hidden whitespace-nowrap border-t border-border pt-2 mt-1">
      <div
        className="inline-block font-mono text-sm text-muted-foreground"
        style={{ animation: "ticker-scroll 24s linear infinite" }}
      >
        {renderTicker("a")}&nbsp;&nbsp;&nbsp;●&nbsp;&nbsp;&nbsp;{renderTicker("b")}
      </div>
    </div>
  );
}