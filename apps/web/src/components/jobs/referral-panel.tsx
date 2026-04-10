"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ReferralPanelProps {
  applicationId: string;
  company: string;
  role: string;
  contact: string;
  referralStatus: "pending" | "contacted" | "connected" | "skipped" | null;
  onStatusChanged: (status: "pending" | "contacted" | "connected" | "skipped") => void;
}

function buildLinkedInSearchUrl(company: string): string {
  const query = encodeURIComponent(company);
  return `https://www.linkedin.com/search/results/people/?keywords=${query}&origin=GLOBAL_SEARCH_HEADER`;
}

function generateNetworkingMessage(company: string, role: string): string {
  return `Hi! I applied for the ${role} role at ${company} and would love to hear about your experience there. Would you be open to a quick chat?`;
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

export function ReferralPanel({
  applicationId,
  company,
  role,
  contact,
  referralStatus,
  onStatusChanged,
}: ReferralPanelProps) {
  const [updating, setUpdating] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState(() => generateNetworkingMessage(company, role));

  const status = referralStatus ?? "pending";
  const config = STATUS_CONFIG[status];
  const linkedInUrl = buildLinkedInSearchUrl(company);

  async function updateStatus(newStatus: "pending" | "contacted" | "connected" | "skipped") {
    setUpdating(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referral_status: newStatus }),
      });
      if (res.ok) {
        onStatusChanged(newStatus);
        const labels: Record<string, string> = { contacted: "Marked as contacted", connected: "Referral connected!", skipped: "Skipped referral" };
        toast.success(labels[newStatus] ?? "Updated");
      } else {
        toast.error("Failed to update");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setUpdating(false);
  }

  function handleCopyMessage() {
    navigator.clipboard.writeText(message);
    toast.success("Message copied to clipboard");
  }

  // Don't show panel if already connected or skipped (unless arriving from action)
  if (status === "connected" || status === "skipped") return null;

  return (
    <Card className={`${config.borderClass} ${config.bgClass}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{"\uD83E\uDD1D"}</span>
              <h3 className={`text-sm font-semibold ${config.textClass}`}>
                {config.label}
              </h3>
            </div>
            <p className={`text-sm ${config.textClass} opacity-80`}>
              {status === "pending"
                ? `The #1 thing that gets resumes seen: find someone inside ${company} who can flag yours.`
                : `You've reached out to a contact at ${company}. Follow up if you don't hear back.`}
            </p>
            {contact && (
              <p className="text-xs text-muted-foreground mt-1">
                Contact: <span className="font-medium">{contact}</span>
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-inherit">
          <a href={linkedInUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="default" className="text-xs">
              Search {company} on LinkedIn
            </Button>
          </a>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => setShowMessage(!showMessage)}
          >
            {showMessage ? "Hide message" : "Draft message"}
          </Button>
          {status === "pending" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => updateStatus("contacted")}
                disabled={updating}
              >
                Mark contacted
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground"
                onClick={() => updateStatus("skipped")}
                disabled={updating}
              >
                Skip
              </Button>
            </>
          )}
          {status === "contacted" && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => updateStatus("connected")}
              disabled={updating}
            >
              Mark connected
            </Button>
          )}
        </div>

        {/* Editable message template */}
        {showMessage && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-xs" onClick={handleCopyMessage}>
                Copy message
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
