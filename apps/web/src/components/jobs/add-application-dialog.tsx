"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface AddApplicationDialogProps {
  onCreated: () => void;
  trigger?: React.ReactNode;
}

export function AddApplicationDialog({
  onCreated,
  trigger,
}: AddApplicationDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scrapeMode, setScrapeMode] = useState<"url" | "bulk" | "paste">(
    "url"
  );
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [newApp, setNewApp] = useState({
    company: "",
    role: "",
    source: "",
    source_url: "",
    job_description: "",
  });
  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResults, setBulkResults] = useState<
    Array<{
      url: string;
      status: string;
      company?: string;
      role?: string;
      error?: string;
    }> | null
  >(null);

  function resetDialog() {
    setNewApp({
      company: "",
      role: "",
      source: "",
      source_url: "",
      job_description: "",
    });
    setScrapeUrl("");
    setScrapeError("");
    setScrapeMode("url");
    setBulkUrls("");
    setBulkResults(null);
  }

  async function handleScrape() {
    if (!scrapeUrl.trim()) return;
    const url = scrapeUrl.trim();

    if (/linkedin\.com/i.test(url)) {
      setScrapeError(
        "LinkedIn blocks automated scraping. Copy the job description from the listing and use"
      );
      setNewApp({ ...newApp, source: "LinkedIn", source_url: url });
      return;
    }

    setScraping(true);
    setScrapeError("");
    try {
      const res = await fetch("/api/scrape-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScrapeError(data.error || "Failed to fetch job listing");
        return;
      }
      setNewApp({
        company: data.company || "",
        role: data.role || "",
        source: data.source || "",
        source_url: data.source_url || url,
        job_description: data.description || "",
      });
      if (data.company || data.role) {
        toast.success("Job details fetched successfully");
      } else {
        setScrapeError(
          "Could not extract job details — please fill in manually"
        );
      }
    } catch {
      setScrapeError("Failed to fetch job listing");
    } finally {
      setScraping(false);
    }
  }

  async function handleCreate() {
    if (!newApp.company || !newApp.role) {
      toast.error("Company and role are required");
      return;
    }
    if (!newApp.job_description || newApp.job_description.trim().length < 50) {
      toast.error("Job description is required (minimum 50 characters)");
      return;
    }
    const payload: Record<string, unknown> = {
      company: newApp.company,
      role: newApp.role,
      job_description: newApp.job_description,
    };
    if (newApp.source) payload.source = newApp.source;
    if (newApp.source_url) payload.source_url = newApp.source_url;

    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created = await res.json();
      toast.success("Application added");
      setDialogOpen(false);
      resetDialog();
      onCreated();

      if (newApp.job_description && created.id) {
        fetch(`/api/applications/${created.id}/score`, { method: "POST" })
          .then((r) => {
            if (r.ok) {
              toast.success(`${newApp.company} scored automatically`);
              onCreated();
            }
          })
          .catch(() => {});
      }
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to add application");
    }
  }

  async function handleBulkImport() {
    const urls = bulkUrls
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urls.length === 0) return;
    setBulkImporting(true);
    setBulkResults(null);
    try {
      const res = await fetch("/api/applications/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Bulk import failed");
        return;
      }
      setBulkResults(data.results);
      toast.success(
        `${data.summary.created} added, ${data.summary.failed} failed`
      );
      onCreated();
    } catch {
      toast.error("Bulk import failed");
    } finally {
      setBulkImporting(false);
    }
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetDialog();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? <Button>Add Application</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Application</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["url", "From URL"],
              ["bulk", "Bulk Import"],
              ["paste", "Paste JD"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setScrapeMode(mode)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                scrapeMode === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* URL mode */}
        {scrapeMode === "url" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Job Listing URL</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="https://..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScrape();
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={handleScrape}
                  disabled={scraping || !scrapeUrl.trim()}
                >
                  {scraping ? "Fetching..." : "Fetch"}
                </Button>
              </div>
              {scrapeError && (
                <p className="text-sm text-destructive mt-1">
                  {scrapeError}
                  {" — "}
                  <button
                    type="button"
                    className="underline text-foreground hover:text-foreground/80"
                    onClick={() => setScrapeMode("paste")}
                  >
                    paste the job description instead
                  </button>
                </p>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  details
                </span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Company</label>
              <Input
                value={newApp.company}
                onChange={(e) =>
                  setNewApp({ ...newApp, company: e.target.value })
                }
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Input
                value={newApp.role}
                onChange={(e) => setNewApp({ ...newApp, role: e.target.value })}
                placeholder="Job title"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Source</label>
              <Input
                value={newApp.source}
                onChange={(e) =>
                  setNewApp({ ...newApp, source: e.target.value })
                }
                placeholder="LinkedIn, Indeed, etc."
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium">
                  Job Description <span className="text-destructive">*</span>
                </label>
                {newApp.job_description && (
                  <span className="text-xs text-muted-foreground">
                    {newApp.job_description.length.toLocaleString()} characters
                  </span>
                )}
              </div>
              <Textarea
                value={newApp.job_description}
                onChange={(e) =>
                  setNewApp({ ...newApp, job_description: e.target.value })
                }
                placeholder={newApp.job_description ? undefined : "Paste or fetch the full job description..."}
                className="mt-1 max-h-[40vh] resize-y"
                rows={4}
              />
            </div>
            <Button onClick={handleCreate} className="w-full">
              Add
            </Button>
          </div>
        )}

        {/* Bulk import mode */}
        {scrapeMode === "bulk" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Job Listing URLs</label>
              <p className="text-xs text-muted-foreground mb-1">
                One URL per line (max 20)
              </p>
              <Textarea
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                placeholder={
                  "https://linkedin.com/jobs/...\nhttps://indeed.com/viewjob?..."
                }
                rows={6}
              />
            </div>
            <Button
              onClick={handleBulkImport}
              className="w-full"
              disabled={bulkImporting || !bulkUrls.trim()}
            >
              {bulkImporting
                ? `Importing ${bulkUrls.split("\n").filter((u) => u.trim()).length} jobs...`
                : `Import ${bulkUrls.split("\n").filter((u) => u.trim()).length || 0} URLs`}
            </Button>
            {bulkResults && (
              <div className="space-y-1 max-h-48 overflow-y-auto text-sm">
                {bulkResults.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded p-2 ${
                      r.status === "created"
                        ? "bg-green-50 dark:bg-green-950"
                        : "bg-red-50 dark:bg-red-950"
                    }`}
                  >
                    <span>{r.status === "created" ? "\u2713" : "\u2717"}</span>
                    <div className="min-w-0 flex-1">
                      {r.status === "created" ? (
                        <span className="font-medium">
                          {r.company} — {r.role}
                        </span>
                      ) : (
                        <span className="text-destructive">{r.error}</span>
                      )}
                      <p className="text-xs text-muted-foreground truncate">
                        {r.url}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paste JD mode */}
        {scrapeMode === "paste" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Company</label>
                <Input
                  value={newApp.company}
                  onChange={(e) =>
                    setNewApp({ ...newApp, company: e.target.value })
                  }
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <Input
                  value={newApp.role}
                  onChange={(e) =>
                    setNewApp({ ...newApp, role: e.target.value })
                  }
                  placeholder="Job title"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Source</label>
              <Input
                value={newApp.source}
                onChange={(e) =>
                  setNewApp({ ...newApp, source: e.target.value })
                }
                placeholder="LinkedIn, Indeed, etc."
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium">Job Description <span className="text-destructive">*</span></label>
                {newApp.job_description && (
                  <span className="text-xs text-muted-foreground">
                    {newApp.job_description.length.toLocaleString()} characters
                  </span>
                )}
              </div>
              <Textarea
                value={newApp.job_description}
                onChange={(e) =>
                  setNewApp({ ...newApp, job_description: e.target.value })
                }
                placeholder="Paste the full job description here..."
                className="mt-1 max-h-[40vh] resize-y"
                rows={6}
              />
            </div>
            <Button onClick={handleCreate} className="w-full">
              Add
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
