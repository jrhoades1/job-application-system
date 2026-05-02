/** Content script — runs on all pages, handles JD capture, job import, and confirmation detection */

import { attemptJDCapture } from "./jd-capture";

setTimeout(() => {
  tryShowImportButton();
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
  if (message.type === "DO_CAPTURE_JD") {
    const result = attemptJDCapture();
    sendResponse(result);
  }
  return true;
});

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

  // Try to match this URL to a tracked application and auto-mark as applied
  chrome.runtime.sendMessage({ type: "MATCH_URL", url: window.location.href }).then(
    async (match) => {
      if (!match) return;
      const success = await chrome.runtime.sendMessage({
        type: "MARK_APPLIED",
        applicationId: match.id,
      });
      if (success) {
        showToast(`Applied: ${match.company} -- ${match.role}`, "success");
      } else {
        showToast("Failed to update status", "error");
      }
    }
  );
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
  error?: string;
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
      showToast(captured.error || "Could not detect company or role from this page", "error");
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
    } else if (response?.lead_updated) {
      btn.innerHTML = `<span style="font-size: 16px; color: #22c55e;">&#10003;</span><div><div style="font-weight: 600; color: #22c55e;">JD Updated!</div><div style="font-size: 11px; color: #888;">${response.company} — ${response.role}</div></div>`;
      btn.style.borderColor = "#22c55e";
      btn.style.opacity = "1";
      showToast(`Lead updated: ${response.company} — ${response.role}`, "success");
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
