/** Lever ATS auto-fill — jobs.lever.co */

import type { ProfileData } from "@/lib/api-client";
import { setInputValue } from "./index";

export function fillLever(profile: ProfileData): { filled: number } {
  let filled = 0;

  // Lever uses a clean form with class-based selectors
  // The apply form typically has: name, email, phone, current company, LinkedIn, URLs
  const fieldMap: [string, string][] = [
    // Lever's standard apply form fields
    ['input[name="name"]', profile.full_name],
    ['input[name="email"]', profile.email],
    ['input[name="phone"]', profile.phone ?? ""],
    ['input[name="org"]', ""],
    ['input[name="urls[LinkedIn]"]', profile.linkedin_url ?? ""],
    ['input[name="urls[Portfolio]"]', profile.portfolio_url ?? ""],
    ['input[name="urls[Other]"]', profile.portfolio_url ?? ""],
    // Fallback selectors
    ['input[placeholder*="Full name" i]', profile.full_name],
    ['input[placeholder*="Email" i]', profile.email],
    ['input[placeholder*="Phone" i]', profile.phone ?? ""],
    ['input[placeholder*="LinkedIn" i]', profile.linkedin_url ?? ""],
    ['input[placeholder*="Current company" i]', ""],
  ];

  // Fill current company if available
  const currentJob = profile.work_history.find((w) => w.current);
  if (currentJob) {
    fieldMap.push(['input[name="org"]', currentJob.company]);
    fieldMap.push(['input[placeholder*="Current company" i]', currentJob.company]);
  }

  for (const [selector, value] of fieldMap) {
    if (!value) continue;
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input && !input.value) {
      setInputValue(input, value);
      filled++;
    }
  }

  return { filled };
}
