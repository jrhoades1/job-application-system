/** Greenhouse ATS auto-fill — boards.greenhouse.io */

import type { ProfileData, MatchedApplication } from "@/lib/api-client";
import { setInputValue } from "./index";

export function fillGreenhouse(
  profile: ProfileData,
  evaluation?: MatchedApplication | null
): { filled: number } {
  let filled = 0;

  // Greenhouse uses standard HTML forms with predictable field IDs
  const fieldMap: [string, string][] = [
    ["#first_name", profile.full_name.split(" ")[0] ?? ""],
    ["#last_name", profile.full_name.split(" ").slice(1).join(" ")],
    ["#email", profile.email],
    ["#phone", profile.phone ?? ""],
    // Greenhouse custom fields
    ['input[name*="first_name"]', profile.full_name.split(" ")[0] ?? ""],
    ['input[name*="last_name"]', profile.full_name.split(" ").slice(1).join(" ")],
    ['input[name*="email"]', profile.email],
    ['input[name*="phone"]', profile.phone ?? ""],
    ['input[name*="linkedin"]', profile.linkedin_url ?? ""],
    ['input[name*="website"]', profile.portfolio_url ?? ""],
    ['input[name*="location"]', profile.location ?? ""],
  ];

  for (const [selector, value] of fieldMap) {
    if (!value) continue;
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input && !input.value) {
      setInputValue(input, value);
      filled++;
    }
  }

  // Fill the "Current Company" and "Current Title" fields if available
  const currentJob = profile.work_history.find((w) => w.current);
  if (currentJob) {
    const companyField = document.querySelector<HTMLInputElement>(
      'input[name*="company" i], input[id*="company" i], input[name*="current_company" i]'
    );
    if (companyField && !companyField.value) {
      setInputValue(companyField, currentJob.company);
      filled++;
    }

    const titleField = document.querySelector<HTMLInputElement>(
      'input[name*="title" i], input[id*="title" i], input[name*="current_title" i]'
    );
    if (titleField && !titleField.value) {
      setInputValue(titleField, currentJob.title);
      filled++;
    }
  }

  // Cover letter field — only fill when we have a cached evaluation.
  // Caller (popup "Fill" button) is the explicit user consent per project
  // security model. Never auto-submit the form after filling.
  if (evaluation?.cover_letter) {
    const coverLetterField = document.querySelector<HTMLTextAreaElement>(
      'textarea[name*="cover" i], textarea[id*="cover" i], textarea[aria-label*="cover" i]'
    );
    if (coverLetterField && !coverLetterField.value) {
      setInputValue(coverLetterField, evaluation.cover_letter);
      filled++;
    }
  }

  return { filled };
}
