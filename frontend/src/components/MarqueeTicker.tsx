export function MarqueeTicker() {
    const TICKER_ITEMS = [
        "Now screening",
        "Live audience data",
        "6 titles tracked",
        "Real-time anomaly detection",
    ];
    const text = TICKER_ITEMS.join("   ●   ");

  return (
    <div className="overflow-hidden whitespace-nowrap border-t border-border pt-2 mt-1">
      <div
        className="inline-block font-mono text-sm text-muted-foreground"
        style={{ animation: "ticker-scroll 24s linear infinite" }}
      >
        {text}&nbsp;&nbsp;&nbsp;●&nbsp;&nbsp;&nbsp;{text}
      </div>
    </div>
  );
}