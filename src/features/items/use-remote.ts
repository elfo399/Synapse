"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api";

export function useRemote<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    api<T>(url, { signal: controller.signal }).then(value => { setData(value); setError(""); }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, revision]);
  useEffect(() => { window.addEventListener("secondbrain:changed", reload); return () => window.removeEventListener("secondbrain:changed", reload); }, [reload]);
  return { data, error, loading, reload };
}
