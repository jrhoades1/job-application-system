/** Content script — runs on all pages, handles detection, badge, auto-fill, JD capture, and job import */

import { detectATS } from "@/lib/ats-patterns";
import type { ProfileData } from "@/lib/api-client";
import { fillGreenhouse } from "./greenhouse";
import { fillLever } from "./lever";
import { attemptJDCapture } from "./jd-capture";

const ats = detectATS(window.location.href);

// Only show badge on pages that have form inputs (likely an application page)
function hasFormInputs(): boolean {
  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea'
  );
  return inputs.length >= 2;
}

// Wait for DOM to settle, then decide what to show
setTimeout(() => {
  if (hasFormInputs()) {
    injectBadge(ats?.label ?? null);
  } else {
    // Not a form page — check if it's a job listing we can import
    tryShowImportButton();
  }
  detectConfirmationPage();
}, 1500);

// LinkedIn is an SPA — re-detect when user clicks a different job in the list.
// Watch for URL changes and DOM mutations that indicate a new job panel loaded.
if (/linkedin\.com\/jobs/i.test(window.location.href)) {
  let lastUrl = window.location.href;

  // Poll for URL changes (LinkedIn doesn't fire popstate reliably)
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // Remove old import button and re-detect
      document.getElementById("jaa-import-badge")?.remove();
      setTimeout(() => tryShowImportButton(), 2000);
    }
  }, 1000);

  // Also watch for job detail panel content changes
  const observer = new MutationObserver(() => {
    const badge = document.getElementById("jaa-import-badge");
    // If no badge and the JD panel has content, try to show the button
    if (!badge) {
      const jdPanel = document.querySelector(".jobs-description__content, #job-details, [class*='jobs-description']");
      if (jdPanel && jdPanel.textContent && jdPanel.textContent.trim().length > 100) {
        tryShowImportButton();
      }
    }
  });
  const jobsContainer = document.querySelector(".jobs-search__job-details, .scaffold-layout__detail, main");
  if (jobsContainer) {
    observer.observe(jobsContainer, { childList: true, subtree: true });
  }
}

// Listen for commands from background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "DO_FILL" && message.profile) {
    const result = fillForm(message.profile);
    sendResponse(result);
  } else if (message.type === "DO_CAPTURE_JD") {
    const result = attemptJDCapture();
    sendResponse(result);
  }
  return true;
});

function fillForm(profile: ProfileData): { filled: number; error?: string } {
  if (!ats) return { filled: 0, error: "Not on a supported ATS page" };

  switch (ats.name) {
    case "greenhouse":
      return fillGreenhouse(profile);
    case "lever":
      return fillLever(profile);
    default:
      return fillGeneric(profile);
  }
}

/** Generic auto-fill — tries common field names/labels */
function fillGeneric(profile: ProfileData): { filled: number } {
  let filled = 0;

  const fieldMap: [string[], string][] = [
    [["first_name", "firstname", "first-name", "fname"], profile.full_name.split(" ")[0] ?? ""],
    [["last_name", "lastname", "last-name", "lname"], profile.full_name.split(" ").slice(1).join(" ")],
    [["email", "email_address", "emailaddress"], profile.email],
    [["phone", "phone_number", "phonenumber", "mobile"], profile.phone ?? ""],
    [["linkedin", "linkedin_url", "linkedin_profile"], profile.linkedin_url ?? ""],
    [["portfolio", "website", "portfolio_url", "personal_website"], profile.portfolio_url ?? ""],
    [["location", "city", "address"], profile.location ?? ""],
  ];

  for (const [names, value] of fieldMap) {
    if (!value) continue;
    for (const name of names) {
      const input = document.querySelector<HTMLInputElement>(
        `input[name*="${name}" i], input[id*="${name}" i], input[autocomplete*="${name}" i]`
      );
      if (input && !input.value) {
        setInputValue(input, value);
        filled++;
        break;
      }
    }
  }

  return { filled };
}

/** Set input value with proper React/change event dispatch */
export function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const nativeSet = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value"
  )?.set ?? Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, "value"
  )?.set;

  if (nativeSet) {
    nativeSet.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Inject floating badge showing ATS detection */
function injectBadge(atsLabel: string | null): void {
  const badge = document.createElement("div");
  badge.id = "jaa-badge";
  const atsTag = atsLabel
    ? `<span style="
        background: #3b82f6;
        color: white;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
      ">${atsLabel}</span>`
    : "";
  badge.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: #1a1a2e;
      color: #eee;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      transition: opacity 0.2s;
    " title="Click to auto-fill application">
      <span style="font-size: 16px;">📋</span>
      <span>Auto-Fill</span>
      ${atsTag}
    </div>
  `;

  badge.addEventListener("click", async () => {
    const response = await chrome.runtime.sendMessage({ type: "FILL_FORM" });
    if (response?.error) {
      showToast(`Error: ${response.error}`, "error");
    } else if (response?.filled > 0) {
      showToast(`Filled ${response.filled} field${response.filled !== 1 ? "s" : ""}`, "success");
    } else {
      showToast("No empty fields found to fill", "info");
    }
  });

  document.body.appendChild(badge);
}

/** Detect "thank you" / confirmation pages after submission */
function detectConfirmationPage(): void {
  const text = document.body.innerText.slice(0, 3000).toLowerCase();
  const confirmPatterns = [
    "application (has been |was )?(received|submitted|recorded)",
    "thank you for (applying|your (application|interest))",
    "thanks for applying",
    "we('ve| have) received your application",
    "application (successfully|has been) submitted",
  ];

  const isConfirmation = confirmPatterns.some((p) => new RegExp(p, "i").test(text));
  if (!isConfirmation) return;

  // Try to match this URL to a tracked application
  chrome.runtime.sendMessage({ type: "MATCH_URL", url: window.location.href }).then(
    (match) => {
      if (match) {
        showConfirmationOverlay(match);
      }
    }
  );
}

interface MatchedApp {
  id: string;
  company: string;
  role: string;
}

function showConfirmationOverlay(match: MatchedApp): void {
  const overlay = document.createElement("div");
  overlay.id = "jaa-confirm-overlay";
  overlay.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: #1a1a2e;
      color: #eee;
      padding: 16px 20px;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      max-width: 320px;
    ">
      <p style="margin: 0 0 8px; font-weight: 600;">Application submitted!</p>
      <p style="margin: 0 0 12px; color: #aaa; font-size: 12px;">
        ${match.company} — ${match.role}
      </p>
      <div style="display: flex; gap: 8px;">
        <button id="jaa-confirm-yes" style="
          background: #3b82f6;
          color: white;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        ">Mark as Applied</button>
        <button id="jaa-confirm-dismiss" style="
          background: transparent;
          color: #888;
          border: 1px solid #444;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        ">Dismiss</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("jaa-confirm-yes")?.addEventListener("click", async () => {
    const success = await chrome.runtime.sendMessage({
      type: "MARK_APPLIED",
      applicationId: match.id,
    });
    if (success) {
      showToast("Marked as Applied!", "success");
    } else {
      showToast("Failed to update", "error");
    }
    overlay.remove();
  });

  document.getElementById("jaa-confirm-dismiss")?.addEventListener("click", () => {
    overlay.remove();
  });
}

/** Auto-detect job listing pages and show "Import Job" button */
function tryShowImportButton(): void {
  const url = window.location.href;

  // Skip pages that definitely aren't job listings
  const skipPatterns = [
    /\/(login|signin|signup|register|auth|account|settings|profile|feed|inbox|messages)\b/i,
    /mail\.google\.com/i,
    /github\.com/i,
    /stackoverflow\.com/i,
    /google\.com\/search/i,
    /^chrome/i,
  ];
  if (skipPatterns.some((p) => p.test(url))) return;

  // Try to extract a JD from the page
  const captured = attemptJDCapture();
  if (!captured.description || captured.description.length < 50) return;

  // We found a JD — show the import button
  injectImportButton(captured);
}

interface CapturedData {
  url: string;
  description: string;
  title?: string;
  company?: string;
}

function injectImportButton(captured: CapturedData): void {
  // Don't double-inject
  if (document.getElementById("jaa-import-badge")) return;

  const badge = document.createElement("div");
  badge.id = "jaa-import-badge";
  badge.innerHTML = `
    <div id="jaa-import-btn" style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: #1a1a2e;
      color: #eee;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid #333;
    " title="Import this job to Job App Assistant">
      <span style="font-size: 16px;">+</span>
      <div>
        <div style="font-weight: 600;">Import Job</div>
        <div style="font-size: 11px; color: #888; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${captured.company ? `${captured.company}` : ""}${captured.company && captured.title ? " — " : ""}${captured.title || ""}
        </div>
      </div>
    </div>
  `;

  badge.addEventListener("mouseenter", () => {
    const btn = document.getElementById("jaa-import-btn");
    if (btn) btn.style.borderColor = "#3b82f6";
  });
  badge.addEventListener("mouseleave", () => {
    const btn = document.getElementById("jaa-import-btn");
    if (btn) btn.style.borderColor = "#333";
  });

  badge.addEventListener("click", async () => {
    const btn = document.getElementById("jaa-import-btn");
    if (!btn) return;

    // Validate we have minimum data
    if (!captured.company || !captured.title) {
      showToast("Could not detect company or role from this page", "error");
      return;
    }

    btn.style.opacity = "0.6";
    btn.style.pointerEvents = "none";
    const origHtml = btn.innerHTML;
    btn.innerHTML = `<span style="font-size: 14px;">...</span><span>Importing...</span>`;

    const response = await chrome.runtime.sendMessage({
      type: "IMPORT_JOB",
      data: {
        url: captured.url,
        job_description: captured.description,
        role: captured.title,
        company: captured.company,
      },
    });

    if (response?.imported) {
      btn.innerHTML = `<span style="font-size: 16px; color: #22c55e;">&#10003;</span><div><div style="font-weight: 600; color: #22c55e;">Imported!</div><div style="font-size: 11px; color: #888;">${response.company} — ${response.role}</div></div>`;
      btn.style.borderColor = "#22c55e";
      btn.style.opacity = "1";
      showToast(`Imported: ${response.company} — ${response.role}`, "success");
    } else if (response?.duplicate) {
      btn.innerHTML = `<span style="font-size: 16px; color: #eab308;">&#8226;</span><div><div style="font-weight: 600; color: #eab308;">Already tracked</div><div style="font-size: 11px; color: #888;">${response.company} — ${response.role}</div></div>`;
      btn.style.borderColor = "#eab308";
      btn.style.opacity = "1";
      showToast(response.jd_updated ? "Already tracked — JD updated" : "Already in your tracker", "info");
    } else {
      btn.innerHTML = origHtml;
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
      showToast("Import failed — check extension connection", "error");
    }
  });

  document.body.appendChild(badge);
}

function showToast(message: string, type: "success" | "error" | "info"): void {
  const colors = {
    success: "#22c55e",
    error: "#ef4444",
    info: "#3b82f6",
  };

  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999999;
    background: ${colors[type]};
    color: white;
    padding: 10px 18px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: opacity 0.3s;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
