import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getTitles } from "../api/client";
import type { TitleMetadataRow } from "../types/audience";

interface TitlesContextValue {
  titles: TitleMetadataRow[];
  loading: boolean;
}

const TitlesContext = createContext<TitlesContextValue | null>(null);

export function TitlesProvider({ children }: { children: ReactNode }) {
  const [titles, setTitles] = useState<TitleMetadataRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTitles()
      .then(setTitles)
      .catch((err) => console.error("[TitlesProvider] failed to load titles:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <TitlesContext.Provider value={{ titles, loading }}>
      {children}
    </TitlesContext.Provider>
  );
}

export function useTitlesContext(): TitlesContextValue {
  const context = useContext(TitlesContext);
  if (!context) {
    throw new Error("useTitlesContext must be used within a TitlesProvider");
  }
  return context;
}