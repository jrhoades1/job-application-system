"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { MatchScoreRow } from "@/types";
import {
  buildLinkedInUrls,
  derivePitch,
  renderTemplate,
  TARGET_LABELS,
  TEMPLATE_LABELS,
  TEMPLATE_TO_TARGET,
  type TargetType,
  type TemplateType,
} from "@/lib/referral-templates";

interface ReferralPanelProps {
  applicationId: string;
  company: string;
  role: string;
  contact: string | null;
  appliedDate: string | null;
  matchScore: MatchScoreRow | null;
  referralStatus: "pending" | "contacted" | "connected" | "skipped" | null;
  onStatusChanged: (status: "pending" | "contacted" | "connected" | "skipped") => void;
}

const STATUS_CONFIG = {
  pending: {
    label: "Find a Referral",
    bgClass: "bg-amber-50 dark:bg-amber-950",
    borderClass: "border-amber-200 dark:border-amber-800",
    textClass: "text-amber-800 dark:text-amber-200",
  },
  contacted: {
    label: "Referral Contacted",
    bgClass: "bg-blue-50 dark:bg-blue-950",
    borderClass: "border-blue-200 dark:border-blue-800",
    textClass: "text-blue-800 dark:text-blue-200",
  },
  connected: {
    label: "Referral Connected",
    bgClass: "bg-green-50 dark:bg-green-950",
    borderClass: "border-green-200 dark:border-green-800",
    textClass: "text-green-800 dark:text-green-200",
  },
  skipped: {
    label: "Referral Skipped",
    bgClass: "bg-gray-50 dark:bg-gray-950",
    borderClass: "border-gray-200 dark:border-gray-800",
    textClass: "text-gray-800 dark:text-gray-200",
  },
};

// Pull a first name out of the free-text contact field. "Jane Doe (Director)"
// and "jane@x.com" both collapse to "Jane" / "jane". Empty/null input → empty string.
// Note: `contact` is typed as `string` in ApplicationRow but the DB column is nullable,
// so we defensively handle null/undefined here.
function extractFirstName(contact: string | null | undefined): string {
  if (!contact) return "";
  const trimmed = contact.trim();
  if (!trimmed) return "";
  // Email: use the local-part
  if (trimmed.includes("@")) {
    const local = trimmed.split("@")[0];
    const namePart = local.split(/[._-]/)[0];
    return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
  }
  // Name: take the first token, strip trailing punctuation
  return trimmed.split(/\s+/)[0].replace(/[^\p{L}'-]/gu, "");
}

export function ReferralPanel({
  applicationId,
  company,
  role,
  contact,
  appliedDate,
  matchScore,
  referralStatus,
  onStatusChanged,
}: ReferralPanelProps) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [templateType, setTemplateType] = useState<TemplateType>("referral");
  const [sharedContext, setSharedContext] = useState("");

  const derivedPitch = useMemo(() => derivePitch(role, matchScore), [role, matchScore]);
  const [pitchOverride, setPitchOverride] = useState<string>("");

  const effectivePitch =
    pitchOverride.trim().length > 0
      ? pitchOverride.trim()
      : derivedPitch ?? "";

  const firstName = extractFirstName(contact);
  const linkedInUrls = useMemo(() => buildLinkedInUrls(company, role), [company, role]);

  const status = referralStatus ?? "pending";
  const config = STATUS_CONFIG[status];

  const warmIntroReady = sharedContext.trim().length > 0;

  const message = useMemo(() => {
    // If the user picked warm_intro without a hook, render shows a hint to fill it in.
    if (templateType === "warm_intro" && !warmIntroReady) {
      return "Add a shared context above (mutual connection, alumni overlap, past coworker) to unlock this template.";
    }
    if (effectivePitch.length === 0 && templateType !== "warm_intro") {
      return "Add a one-line pitch above -- either auto-derived from your top match or written manually.";
    }
    return renderTemplate(templateType, {
      firstName,
      role,
      company,
      pitch: effectivePitch,
      dateApplied: appliedDate,
      sharedContext,
    });
  }, [templateType, effectivePitch, warmIntroReady, firstName, role, company, appliedDate, sharedContext]);

  const canCopy = !(
    (templateType === "warm_intro" && !warmIntroReady) ||
    (templateType !== "warm_intro" && effectivePitch.length === 0)
  );

  async function updateStatus(
    newStatus: "pending" | "contacted" | "connected" | "skipped",
    extra: { referral_template_type?: TemplateType } = {}
  ) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referral_status: newStatus, ...extra }),
      });
      if (res.ok) {
        onStatusChanged(newStatus);
        const labels: Record<string, string> = {
          contacted: "Marked as contacted",
          connected: "Referral connected!",
          skipped: "Skipped referral",
        };
        toast.success(labels[newStatus] ?? "Updated");
        router.push("/dashboard");
        return;
      }
      toast.error("Failed to update");
    } catch {
      toast.error("Something went wrong");
    }
    setUpdating(false);
  }

  function handleCopyMessage() {
    if (!canCopy) return;
    navigator.clipboard.writeText(message);
    toast.success("Message copied to clipboard");
  }

  // Don't show panel if already connected or skipped
  if (status === "connected" || status === "skipped") return null;

  // --- Contacted state: minimal follow-up card (unchanged behavior) ---
  if (status === "contacted") {
    return (
      <Card className={`${config.borderClass} ${config.bgClass}`}>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{"\uD83E\uDD1D"}</span>
            <h3 className={`text-sm font-semibold ${config.textClass}`}>{config.label}</h3>
          </div>
          <p className={`text-sm ${config.textClass} opacity-80`}>
            You&apos;ve reached out to a contact at {company}. Follow up if you don&apos;t hear back.
          </p>
          {contact && (
            <p className="text-xs text-muted-foreground mt-1">
              Contact: <span className="font-medium">{contact}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-inherit">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => updateStatus("connected")}
              disabled={updating}
            >
              Mark connected
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Pending state: the new 3-step flow ---
  return (
    <Card className={`${config.borderClass} ${config.bgClass}`}>
      <CardContent className="py-4 space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{"\uD83E\uDD1D"}</span>
            <h3 className={`text-sm font-semibold ${config.textClass}`}>{config.label}</h3>
          </div>
          <p className={`text-sm ${config.textClass} opacity-80`}>
            The #1 thing that gets resumes seen: find someone inside {company} who can flag yours.
          </p>
        </div>

        {/* Step 1: Find target */}
        <div>
          <div className={`text-xs font-semibold uppercase tracking-wide ${config.textClass} opacity-80 mb-2`}>
            Step 1 &middot; Find someone at {company}
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(linkedInUrls) as TargetType[]).map((target) => (
              <a key={target} href={linkedInUrls[target]} target="_blank" rel="noopener noreferrer">
                <Button
                  size="sm"
                  variant={TEMPLATE_TO_TARGET[templateType] === target ? "default" : "outline"}
                  className="text-xs"
                >
                  {TARGET_LABELS[target]} &#8599;
                </Button>
              </a>
            ))}
          </div>
        </div>

        {/* Step 2: Pick the ask */}
        <div>
          <div className={`text-xs font-semibold uppercase tracking-wide ${config.textClass} opacity-80 mb-2`}>
            Step 2 &middot; Pick your ask
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TEMPLATE_LABELS) as TemplateType[]).map((t) => {
              const disabled = t === "warm_intro" && !warmIntroReady;
              return (
                <Button
                  key={t}
                  size="sm"
                  variant={templateType === t ? "default" : "outline"}
                  className="text-xs"
                  onClick={() => setTemplateType(t)}
                  disabled={disabled}
                  title={disabled ? "Add a shared context below to unlock" : undefined}
                >
                  {TEMPLATE_LABELS[t]}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Fill fields + copy message */}
        <div className="space-y-2">
          <div className={`text-xs font-semibold uppercase tracking-wide ${config.textClass} opacity-80`}>
            Step 3 &middot; Copy message
          </div>

          {templateType !== "warm_intro" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                One-line pitch{" "}
                {derivedPitch && pitchOverride.length === 0 && (
                  <span className="italic">(auto-derived from your top match)</span>
                )}
              </label>
              <Input
                value={pitchOverride}
                onChange={(e) => setPitchOverride(e.target.value)}
                placeholder={derivedPitch ?? "Write a one-line pitch (e.g., \"12 years scaling B2B SaaS platforms\")"}
                className="text-sm"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Shared context{" "}
              <span className="italic">
                (required for Warm intro; otherwise optional)
              </span>
            </label>
            <Input
              value={sharedContext}
              onChange={(e) => setSharedContext(e.target.value)}
              placeholder={'e.g., "we\'re both connected with Alex Chen" or "we both worked at Acme"'}
              className="text-sm"
            />
          </div>

          <Textarea value={message} readOnly rows={8} className="text-sm font-mono" />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-inherit">
          <Button
            size="sm"
            variant="default"
            className="text-xs"
            onClick={handleCopyMessage}
            disabled={!canCopy}
          >
            Copy message
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => updateStatus("contacted", { referral_template_type: templateType })}
            disabled={updating}
          >
            Mark contacted
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground ml-auto"
            onClick={() => updateStatus("skipped")}
            disabled={updating}
          >
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
