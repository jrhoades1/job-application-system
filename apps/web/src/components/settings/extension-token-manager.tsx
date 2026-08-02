"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ExtensionToken {
  id: string;
  token_prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ExtensionTokenManager() {
  const [tokens, setTokens] = useState<ExtensionToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Plaintext of the token just generated — shown once, never refetchable.
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/extension-token");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTokens(data.tokens ?? []);
    } catch {
      toast.error("Could not load extension tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/settings/extension-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not generate a token");
        return;
      }
      setFreshToken(data.token);
      await load();
      toast.success("Token generated — copy it now, it won't be shown again");
    } catch {
      toast.error("Could not generate a token");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(token: ExtensionToken) {
    if (
      !confirm(
        `Revoke ${token.token_prefix}…? Any extension using it stops working immediately.`
      )
    ) {
      return;
    }
    setRevoking(token.id);
    try {
      const res = await fetch(`/api/settings/extension-token?id=${token.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Could not revoke the token");
        return;
      }
      setTokens((prev) => prev.filter((t) => t.id !== token.id));
      toast.success("Token revoked");
    } catch {
      toast.error("Could not revoke the token");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium">API Token</label>
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating
              ? "Generating..."
              : tokens.length > 0
                ? "Generate new token"
                : "Generate token"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Treat this like a password. It is shown once, at generation. To rotate,
          generate a new token, paste it into the extension, then revoke the old one.
        </p>
      </div>

      {freshToken && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm font-medium">
            Copy this now — it will not be shown again.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={freshToken} className="font-mono text-xs" />
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(freshToken);
                toast.success("Token copied to clipboard");
              }}
            >
              Copy
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setFreshToken(null)}>
            Done
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tokens...</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active tokens. Generate one to connect the extension.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-sm">{token.token_prefix}…</code>
                  {token.last_used_at === null && (
                    <Badge variant="secondary">unused</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {formatDate(token.created_at)} · Last used{" "}
                  {formatDate(token.last_used_at)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRevoke(token)}
                disabled={revoking === token.id}
              >
                {revoking === token.id ? "Revoking..." : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
