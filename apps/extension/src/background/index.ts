/** Background service worker — handles messaging between popup/content scripts and API */

import { matchUrl, markApplied, captureJobDescription, fetchLeadsNeedingJD, importJob } from "@/lib/api-client";
import { getProfile } from "@/lib/profile-store";

// Message types
export type Message =
  | { type: "GET_PROFILE" }
  | { type: "MATCH_URL"; url: string }
  | { type: "MARK_APPLIED"; applicationId: string }
  | { type: "FILL_FORM" }
  | { type: "CAPTURE_JD" }
  | { type: "IMPORT_JOB"; data: { url: string; job_description: string; role: string; company: string; location?: string } }
  | { type: "BULK_CAPTURE_START" }
  | { type: "BULK_CAPTURE_STATUS" }
  | { type: "BULK_CAPTURE_STOP" };

// Bulk capture state
let bulkCapture = {
  running: false,
  total: 0,
  processed: 0,
  captured: 0,
  failed: 0,
  currentLead: "" as string,
};

/** Wait ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait for a tab to finish loading */
function waitForTab(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Tab load timeout"));
    }, timeoutMs);

    function listener(id: number, info: chrome.tabs.TabChangeInfo) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Run the bulk capture process */
async function runBulkCapture() {
  bulkCapture = { running: true, total: 0, processed: 0, captured: 0, failed: 0, currentLead: "Fetching leads..." };

  const leads = await fetchLeadsNeedingJD();
  if (leads.length === 0) {
    bulkCapture = { ...bulkCapture, running: false, currentLead: "No leads need JDs" };
    return;
  }

  bulkCapture.total = leads.length;

  // Create a background tab for crawling
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  if (!tab.id) {
    bulkCapture = { ...bulkCapture, running: false, currentLead: "Failed to create tab" };
    return;
  }
  const tabId = tab.id;

  for (const lead of leads) {
    if (!bulkCapture.running) break;

    bulkCapture.currentLead = `${lead.company} — ${lead.role}`;
    const url = lead.career_page_url || lead.search_url;

    try {
      // Navigate to the job search URL
      await chrome.tabs.update(tabId, { url });
      await waitForTab(tabId);
      // Extra wait for SPA content to render
      await sleep(3000);

      // Extract JD from the page
      let extracted;
      try {
        extracted = await chrome.tabs.sendMessage(tabId, { type: "DO_CAPTURE_JD" });
      } catch {
        // Content script not loaded — wait and retry
        await sleep(2000);
        try {
          extracted = await chrome.tabs.sendMessage(tabId, { type: "DO_CAPTURE_JD" });
        } catch {
          bulkCapture.failed++;
          bulkCapture.processed++;
          continue;
        }
      }

      if (extracted?.description && extracted.description.length > 50) {
        const result = await captureJobDescription(
          extracted.url || url,
          extracted.description,
          extracted.title || lead.role,
          extracted.company || lead.company
        );
        if (result?.matched) {
          bulkCapture.captured++;
        } else {
          bulkCapture.failed++;
        }
      } else {
        bulkCapture.failed++;
      }
    } catch {
      bulkCapture.failed++;
    }

    bulkCapture.processed++;

    // Small delay between requests to be polite to LinkedIn
    if (bulkCapture.running) await sleep(2000);
  }

  // Clean up
  try { chrome.tabs.remove(tabId); } catch { /* tab may already be closed */ }
  bulkCapture.running = false;
  bulkCapture.currentLead = "Done";
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // async response
});

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case "GET_PROFILE":
      return await getProfile();

    case "MATCH_URL":
      return await matchUrl(message.url);

    case "MARK_APPLIED":
      return await markApplied(message.applicationId);

    case "FILL_FORM": {
      const profile = await getProfile();
      if (!profile) return { error: "No profile available" };
      // Send profile to the active tab's content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: "No active tab" };
      // Look up cached evaluation (cover letter, archetype, score) for this URL.
      // Content script passes it through to fillGreenhouse/fillLever which
      // only inject the cover letter if the user clicked "Fill" — that click
      // is the consent gate per project security model. Never auto-submit.
      const evaluation = tab.url ? await matchUrl(tab.url) : null;
      return await chrome.tabs.sendMessage(tab.id, {
        type: "DO_FILL",
        profile,
        evaluation,
      });
    }

    case "CAPTURE_JD": {
      // Triggered from popup — tell content script to extract, then send to API
      const [captureTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!captureTab?.id) return { error: "No active tab" };
      const extracted = await chrome.tabs.sendMessage(captureTab.id, { type: "DO_CAPTURE_JD" });
      if (extracted?.error) return { error: extracted.error };
      if (!extracted?.description) return { error: "No job description found on this page" };
      return await captureJobDescription(
        extracted.url,
        extracted.description,
        extracted.title,
        extracted.company
      );
    }

    case "IMPORT_JOB":
      return await importJob(message.data);

    case "BULK_CAPTURE_START":
      if (bulkCapture.running) return { error: "Already running" };
      runBulkCapture(); // fire and forget
      return { started: true };

    case "BULK_CAPTURE_STATUS":
      return { ...bulkCapture };

    case "BULK_CAPTURE_STOP":
      bulkCapture.running = false;
      return { stopped: true };

    default:
      return { error: "Unknown message type" };
  }
}
