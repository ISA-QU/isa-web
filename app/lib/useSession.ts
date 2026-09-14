"use client";

import { useMemo, useSyncExternalStore } from "react";

import { sessionSnapshot, subscribeToSession, type Session } from "./auth";

/**
 * The signed-in session, kept in step with sign-in and sign-out in this and
 * other tabs. `undefined` until the browser's storage has been read — during
 * prerendering and the first hydration pass — so callers can tell "not known
 * yet" from "signed out".
 */
export function useSession(): Session | null | undefined {
  const raw = useSyncExternalStore<string | null | undefined>(
    subscribeToSession,
    sessionSnapshot,
    () => undefined,
  );
  return useMemo(() => {
    if (raw === undefined || raw === null) return raw;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }, [raw]);
}
