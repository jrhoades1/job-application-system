"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

export function useGmailSync(options?: { onSynced?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/gmail/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConnected(!!d?.is_active))
      .catch(() => setConnected(false));
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        const parts = [];
        if (d.inserted > 0) parts.push(`${d.inserted} new lead${d.inserted !== 1 ? "s" : ""}`);
        if (d.confirmed > 0) parts.push(`${d.confirmed} application${d.confirmed !== 1 ? "s" : ""} confirmed`);
        if (d.rejected > 0) parts.push(`${d.rejected} rejection${d.rejected !== 1 ? "s" : ""} processed`);
        toast.success(
          parts.length > 0
            ? `Sync complete — ${parts.join(", ")}`
            : "Sync complete — no new updates"
        );
        options?.onSynced?.();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Sync failed");
        // Re-check connection status on failure
        const updated = await fetch("/api/gmail/status");
        if (updated.ok) {
          const status = await updated.json();
          setConnected(!!status?.is_active);
        }
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSyncing(false);
    }
  }, [options]);

  return { syncing, connected, sync };
}
