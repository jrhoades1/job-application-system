/** Background service worker — handles messaging between popup/content scripts and API */

import { matchUrl, markApplied, captureJobDescription } from "@/lib/api-client";
import { getProfile } from "@/lib/profile-store";

// Message types
export type Message =
  | { type: "GET_PROFILE" }
  | { type: "MATCH_URL"; url: string }
  | { type: "MARK_APPLIED"; applicationId: string }
  | { type: "FILL_FORM" }
  | { type: "CAPTURE_JD"; url: string; description: string; title?: string; company?: string };

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
      return await chrome.tabs.sendMessage(tab.id, { type: "DO_FILL", profile });
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

    default:
      return { error: "Unknown message type" };
  }
}
