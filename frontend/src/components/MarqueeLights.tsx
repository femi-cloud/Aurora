interface MarqueeLightsProps {
  count?: number;
  size?: "sm" | "md" | "lg";
}

export function MarqueeLights({ count = 12, size = "sm" }: MarqueeLightsProps) {
  const bulbSize = size === "sm" ? "w-1 h-1" : size === "lg" ? "w-2 h-2" : "w-1.5 h-1.5";
  const gap = size === "sm" ? "gap-1.5" : "gap-2";

  return (
    <div className={`flex items-center ${gap}`}>
      {Array.from({ length: count }).map((_, i) => {
        const isStrong = i % 4 === 0;
        return (
          <span
            key={i}
            className={`${bulbSize} rounded-full bg-marquee`}
            style={{
              animation: `${isStrong ? "bulb-chase-strong" : "bulb-chase"} 2.2s ease-in-out infinite`,
              animationDelay: `${i * 0.12}s`,
              boxShadow: isStrong
                ? "0 0 5px var(--color-marquee)"
                : "0 0 3px var(--color-marquee)",
            }}
          />
        );
      })}
    </div>
  );
}