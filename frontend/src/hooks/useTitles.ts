import { useEffect, useState } from "react";
import { getTitles } from "../api/client";
import type { TitleMetadataRow } from "../types/audience";

export function useTitles() {
  const [titles, setTitles] = useState<TitleMetadataRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTitles()
      .then(setTitles)
      .catch((err) => console.error("[useTitles] failed to load titles:", err))
      .finally(() => setLoading(false));
  }, []);

  return { titles, loading };
}