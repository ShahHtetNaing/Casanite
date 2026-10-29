"use client";

import { useCallback, useEffect, useState } from "react";

export type GoogleState<T> =
  | { status: "loading"; data?: T }
  | { status: "ready"; data: T }
  | { status: "not_connected"; message: string }
  | { status: "error"; message: string };

export function useGoogleData<T>(url: string) {
  const [state, setState] = useState<GoogleState<T>>({ status: "loading" });

  const refresh = useCallback(async () => {
    setState((s) => ({ status: "loading", data: "data" in s ? s.data : undefined }));
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setState({ status: "ready", data: body as T });
      else if (res.status === 409) setState({ status: "not_connected", message: body.message });
      else setState({ status: "error", message: body.message ?? body.error ?? `HTTP ${res.status}` });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }, [url]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}
