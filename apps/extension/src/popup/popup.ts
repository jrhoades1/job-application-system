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

  // Capture JD button
  $("capture-jd-btn").addEventListener("click", async () => {
    const btn = $("capture-jd-btn") as HTMLButtonElement;
    const status = $("capture-status");
    btn.textContent = "Capturing...";
    btn.disabled = true;
    status.classList.add("hidden");

    const response = await chrome.runtime.sendMessage({ type: "CAPTURE_JD" });

    if (response?.error) {
      status.textContent = response.error;
      status.style.color = "#ef4444";
      status.classList.remove("hidden");
      btn.textContent = "Capture Job Description";
    } else if (response?.matched) {
      const debug = response._page_title ? ` [title: "${response._extracted_title}", co: "${response._extracted_company}"]` : "";
      status.textContent = `Captured for ${response.company} — ${response.role}${debug}`;
      status.style.color = "#22c55e";
      status.classList.remove("hidden");
      btn.textContent = "Captured!";
    } else {
      status.textContent = response?.message || "No matching lead found in pipeline";
      status.style.color = "#eab308";
      status.classList.remove("hidden");
      btn.textContent = "Capture Job Description";
    }

    setTimeout(() => {
      btn.textContent = "Capture Job Description";
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
