"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";

// Auto-sync cooldown: don't silently re-sync more than once per window to
// keep Gmail API calls and AI extraction costs predictable. The user can
// still hit the manual Sync button to bypass.
const AUTO_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const AUTO_SYNC_STORAGE_KEY = "gmail:last-auto-sync";

export function useGmailSync(options?: { onSynced?: () => void; autoSync?: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const autoSyncFiredRef = useRef(false);

  useEffect(() => {
    fetch("/api/gmail/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConnected(!!d?.is_active))
      .catch(() => setConnected(false));
  }, []);

  const runSync = useCallback(
    async (silent: boolean) => {
      setSyncing(true);
      try {
        const res = await fetch("/api/gmail/sync", { method: "POST" });
        if (res.ok) {
          const d = await res.json();
          const parts = [];
          if (d.inserted > 0) parts.push(`${d.inserted} new lead${d.inserted !== 1 ? "s" : ""}`);
          if (d.confirmed > 0) parts.push(`${d.confirmed} application${d.confirmed !== 1 ? "s" : ""} confirmed`);
          if (d.rejected > 0) parts.push(`${d.rejected} rejection${d.rejected !== 1 ? "s" : ""} processed`);
          if (!silent || parts.length > 0) {
            toast.success(
              parts.length > 0
                ? `Sync complete — ${parts.join(", ")}`
                : "Sync complete — no new updates"
            );
          }
          options?.onSynced?.();
        } else {
          const err = await res.json();
          if (!silent) toast.error(err.error ?? "Sync failed");
          const updated = await fetch("/api/gmail/status");
          if (updated.ok) {
            const status = await updated.json();
            setConnected(!!status?.is_active);
          }
        }
      } catch {
        if (!silent) toast.error("Something went wrong");
      } finally {
        setSyncing(false);
      }
    },
    [options]
  );

  const sync = useCallback(() => runSync(false), [runSync]);

  // Auto-sync on mount when enabled and connected, rate-limited across tabs
  // via localStorage so a new user forwarding a rejection gets it processed
  // without having to hit the manual Sync button.
  useEffect(() => {
    if (!options?.autoSync) return;
    if (connected !== true) return;
    if (autoSyncFiredRef.current) return;

    const lastRaw = typeof window !== "undefined" ? window.localStorage.getItem(AUTO_SYNC_STORAGE_KEY) : null;
    const last = lastRaw ? Number(lastRaw) : 0;
    if (Number.isFinite(last) && Date.now() - last < AUTO_SYNC_COOLDOWN_MS) return;

    autoSyncFiredRef.current = true;
    try {
      window.localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage can throw in private mode; ignore
    }
    runSync(true);
  }, [connected, options?.autoSync, runSync]);

  return { syncing, connected, sync };
}
