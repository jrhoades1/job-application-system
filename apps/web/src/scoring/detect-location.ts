/**
 * Detect location and remote status from job description.
 * Ported from job_score.py detect_location_match()
 */

export interface LocationResult {
  match: boolean;
  location: string;
  remote_status: "remote" | "hybrid" | "onsite" | "unknown";
}

export function detectLocationMatch(
  description: string,
  userPreferences: { location?: string }
): LocationResult {
  if (!description) {
    return { match: true, location: "Unknown", remote_status: "unknown" };
  }

  const lower = description.toLowerCase();
  const preferredLocation = (userPreferences.location ?? "").toLowerCase();

  // Detect remote status
  let remote_status: LocationResult["remote_status"];
  if (
    /\b(?:fully remote|100% remote|remote[- ]first|work from (?:home|anywhere))\b/.test(
      lower
    )
  ) {
    remote_status = "remote";
  } else if (/\bhybrid\b/.test(lower)) {
    remote_status = "hybrid";
  } else if (/\b(?:on[- ]?site|in[- ]?office|in[- ]?person)\b/.test(lower)) {
    remote_status = "onsite";
  } else {
    remote_status = "unknown";
  }

  // Check match against preference
  let match: boolean;
  if (preferredLocation.includes("remote")) {
    match = remote_status === "remote" || remote_status === "unknown";
  } else {
    match = true; // Can't reliably geo-match
  }

  // Extract location text
  let location = "";
  const locMatch = description.match(
    /(?:location|based in|located in)[:\s]+([^\n.]{3,50})/i
  );
  if (locMatch) {
    location = locMatch[1].trim();
  }

  return { match, location, remote_status };
}
