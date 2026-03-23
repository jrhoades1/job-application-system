/**
 * Twilio helpers — outbound SMS and webhook signature validation.
 * Uses the Twilio REST API directly (no SDK dependency).
 */

import { createHmac } from "crypto";

/**
 * Send an SMS via the Twilio REST API.
 * Throws if Twilio is not configured or the API request fails.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Twilio not configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER"
    );
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio SMS failed (${res.status}): ${text}`);
  }
}

/**
 * Validate the X-Twilio-Signature header on an inbound webhook.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Algorithm:
 *   1. Sort all POST params alphabetically
 *   2. Concatenate key+value pairs and append to the full webhook URL
 *   3. HMAC-SHA1 with TWILIO_AUTH_TOKEN, base64-encode, compare
 */
export function validateTwilioSignature(
  authToken: string,
  twilioSignature: string,
  webhookUrl: string,
  params: Record<string, string>
): boolean {
  const paramStr = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + (params[key] ?? ""), "");

  const expected = createHmac("sha1", authToken)
    .update(webhookUrl + paramStr)
    .digest("base64");

  return expected === twilioSignature;
}

/** Wrap a message in a TwiML <Response><Message> envelope. */
export function twiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

/** Return an empty TwiML <Response> (no reply sent to sender). */
export function twimlEmpty(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
