"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Shows a small banner when a new deployment is detected.
 *
 * On mount, captures the current commit SHA from /api/version.
 * Polls every 30s. When the SHA changes, shows a "New version deployed"
 * banner with a reload button.
 */
export function DeployIndicator() {
  const [initialSha, setInitialSha] = useState<string | null>(null);
  const [newVersion, setNewVersion] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch("/api/version");
      if (!res.ok) return;
      const data = await res.json();
      const sha = data.sha as string;

      if (!initialSha) {
        setInitialSha(sha);
      } else if (sha !== initialSha && sha !== "dev") {
        setNewVersion(true);
      }
    } catch {
      // silent
    }
  }, [initialSha]);

  useEffect(() => {
    checkVersion();
    const interval = setInterval(checkVersion, 30_000);
    return () => clearInterval(interval);
  }, [checkVersion]);

  if (!newVersion) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-3 text-sm animate-in slide-in-from-bottom-2">
      <span>New version deployed</span>
      <button
        onClick={() => window.location.reload()}
        className="bg-white text-blue-600 font-medium rounded px-2.5 py-1 text-xs hover:bg-blue-50 transition-colors"
      >
        Reload
      </button>
    </div>
  );
}
