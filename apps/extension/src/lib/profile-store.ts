/** Local cache for profile data — only structured fields, never full resume */

import type { ProfileData } from "./api-client";
import { fetchProfile } from "./api-client";

const PROFILE_KEY = "jaa_profile";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CachedProfile {
  data: ProfileData;
  fetchedAt: number;
}

export async function getProfile(): Promise<ProfileData | null> {
  // Check cache first
  const result = await chrome.storage.local.get(PROFILE_KEY);
  const cached = result[PROFILE_KEY] as CachedProfile | undefined;

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // Fetch fresh
  const profile = await fetchProfile();
  if (profile) {
    await chrome.storage.local.set({
      [PROFILE_KEY]: { data: profile, fetchedAt: Date.now() } satisfies CachedProfile,
    });
  }
  return profile;
}

export async function clearProfile(): Promise<void> {
  await chrome.storage.local.remove(PROFILE_KEY);
}
