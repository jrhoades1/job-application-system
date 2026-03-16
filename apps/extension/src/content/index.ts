/** Content script — runs on all pages, handles detection, badge, and auto-fill */

import { detectATS } from "@/lib/ats-patterns";
import type { ProfileData } from "@/lib/api-client";
import { fillGreenhouse } from "./greenhouse";
import { fillLever } from "./lever";

const ats = detectATS(window.location.href);

// Only show badge on pages that have form inputs (likely an application page)
function hasFormInputs(): boolean {
  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea'
  );
  return inputs.length >= 2;
}

// Wait for DOM to settle, then decide whether to show badge
setTimeout(() => {
  if (hasFormInputs()) {
    injectBadge(ats?.label ?? null);
  }
  detectConfirmationPage();
}, 1000);

// Listen for fill commands from background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "DO_FILL" && message.profile) {
    const result = fillForm(message.profile);
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
