/** Popup script — manages setup, profile display, and auto-fill trigger */

import { getConfig, saveConfig, clearConfig } from "@/lib/api-client";
import { clearProfile } from "@/lib/profile-store";

const $ = (id: string) => document.getElementById(id)!;

async function init() {
  const config = await getConfig();

  if (config) {
    showConnected();
    loadProfile();
    checkCurrentPage();
  } else {
    showSetup();
  }

  // Setup form
  $("save-config").addEventListener("click", async () => {
    const url = ($("api-url") as HTMLInputElement).value.trim().replace(/\/$/, "");
    const token = ($("api-token") as HTMLInputElement).value.trim();

    if (!url || !token) {
      $("setup-error").textContent = "Both fields are required";
      $("setup-error").classList.remove("hidden");
      return;
    }

    // Test connection
    try {
      const res = await fetch(`${url}/api/extension/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        $("setup-error").textContent = "Connection failed — check URL and token";
        $("setup-error").classList.remove("hidden");
        return;
      }
    } catch {
      $("setup-error").textContent = "Cannot reach server — check URL";
      $("setup-error").classList.remove("hidden");
      return;
    }

    await saveConfig({ apiBaseUrl: url, apiToken: token });
    showConnected();
    loadProfile();
    checkCurrentPage();
  });

  // Disconnect
  $("disconnect-btn").addEventListener("click", async () => {
    await clearConfig();
    await clearProfile();
    showSetup();
  });

  // Import Job button — triggers JD capture + creates application
  $("import-job-btn").addEventListener("click", async () => {
    const btn = $("import-job-btn") as HTMLButtonElement;
    const status = $("import-status");
    btn.textContent = "Importing...";
    btn.disabled = true;
    status.classList.add("hidden");

    // Ask content script to extract JD
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      status.textContent = "No active tab";
      status.style.color = "#ef4444";
      status.classList.remove("hidden");
      btn.textContent = "Import Job";
      btn.disabled = false;
      return;
    }

    let extracted;
    try {
      extracted = await chrome.tabs.sendMessage(tab.id, { type: "DO_CAPTURE_JD" });
    } catch {
      // Content script may not be injected — try programmatic injection
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Inline JD extraction for when content script isn't reachable
            const selectors = [
              ".show-more-less-html__markup", ".description__text",
              ".jobs-description__content", "#job-details",
              "[class*='jobs-description']", ".job-description",
              "#jobDescriptionText", ".jobsearch-jobDescriptionText",
              "[class*='description']", "article", "main section",
            ];
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && el.innerText.trim().length > 100) {
                const title = document.querySelector("h1")?.innerText?.trim();
                const company = document.querySelector("[class*='company']")?.innerText?.trim();
                return { url: window.location.href, description: el.innerText.trim().slice(0, 50000), title, company };
              }
            }
            return { url: window.location.href, description: "", error: "No job description found" };
          },
        });
        extracted = results?.[0]?.result;
      } catch {
        status.textContent = "Cannot read this page — try refreshing";
        status.style.color = "#ef4444";
        status.classList.remove("hidden");
        btn.textContent = "Import Job";
        btn.disabled = false;
        return;
      }
    }

    if (!extracted?.description || extracted.description.length < 50) {
      status.textContent = extracted?.error || "No job description found on this page";
      status.style.color = "#ef4444";
      status.classList.remove("hidden");
      btn.textContent = "Import Job";
      btn.disabled = false;
      return;
    }

    if (!extracted.company || !extracted.title) {
      status.textContent = "Could not detect company or role";
      status.style.color = "#ef4444";
      status.classList.remove("hidden");
      btn.textContent = "Import Job";
      btn.disabled = false;
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "IMPORT_JOB",
      data: {
        url: extracted.url,
        job_description: extracted.description,
        role: extracted.title,
        company: extracted.company,
      },
    });

    if (response?.imported) {
      status.textContent = `Imported: ${response.company} — ${response.role}`;
      status.style.color = "#22c55e";
      status.classList.remove("hidden");
      btn.textContent = "Imported!";
    } else if (response?.duplicate) {
      status.textContent = `Already tracked: ${response.company} — ${response.role}`;
      status.style.color = "#eab308";
      status.classList.remove("hidden");
      btn.textContent = "Import Job";
    } else {
      status.textContent = "Import failed — check connection";
      status.style.color = "#ef4444";
      status.classList.remove("hidden");
      btn.textContent = "Import Job";
    }

    setTimeout(() => {
      btn.textContent = "Import Job";
      btn.disabled = false;
    }, 3000);
  });

  // Auto-fill button
  $("fill-btn").addEventListener("click", async () => {
    const btn = $("fill-btn") as HTMLButtonElement;
    btn.textContent = "Filling...";
    btn.disabled = true;

    const response = await chrome.runtime.sendMessage({ type: "FILL_FORM" });

    if (response?.error) {
      btn.textContent = `Error: ${response.error}`;
    } else if (response?.filled > 0) {
      btn.textContent = `Filled ${response.filled} fields!`;
    } else {
      btn.textContent = "No empty fields found";
    }

    setTimeout(() => {
      btn.textContent = "Auto-Fill Application";
      btn.disabled = false;
    }, 2000);
  });
}

function showSetup() {
  $("setup-section").classList.remove("hidden");
  $("connected-section").classList.add("hidden");
}

function showConnected() {
  $("setup-section").classList.add("hidden");
  $("connected-section").classList.remove("hidden");
}

async function loadProfile() {
  const profile = await chrome.runtime.sendMessage({ type: "GET_PROFILE" });
  if (profile) {
    $("profile-name").textContent = profile.full_name || "—";
    $("profile-email").textContent = profile.email || "—";
    $("profile-phone").textContent = profile.phone || "—";
  } else {
    $("status-dot").classList.replace("green", "red");
    $("status-text").textContent = "Cannot reach server";
  }
}

async function checkCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  const match = await chrome.runtime.sendMessage({ type: "MATCH_URL", url: tab.url });
  if (match) {
    $("no-match").classList.add("hidden");
    $("match-card").classList.remove("hidden");
    $("match-company").textContent = match.company;
    $("match-role").textContent = match.role;
  }
}

document.addEventListener("DOMContentLoaded", init);
