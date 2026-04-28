export interface ApplicationCandidate {
  id: string;
  company: string | null;
  role: string | null;
  posting_id: string | null;
}

export interface PromotionLead {
  promoted_application_id: string | null;
  posting_id: string | null;
  company: string | null;
  role: string | null;
}

/**
 * Pick the existing application a "Promote lead" action should link to,
 * given a set of candidate applications already in the user's account.
 *
 * Match precedence:
 *   1. The lead's own `promoted_application_id` if it points at a candidate
 *      (heal state where a prior promote linked but didn't flip status)
 *   2. Same canonical `posting_id` (catches the LinkedIn-search-panel case
 *      where the existing app has a wrong-extracted company like "LinkedIn"
 *      but the same job-board posting id as the lead — `applications_posting_id_unique`
 *      would otherwise crash the INSERT with a duplicate key error)
 *   3. Exact `company + role` match (the original dedup behavior)
 *
 * Returns the matched candidate, or null if nothing matches and a fresh
 * application should be inserted.
 */
export function pickPromotionMatch(
  candidates: ApplicationCandidate[],
  lead: PromotionLead,
): ApplicationCandidate | null {
  if (lead.promoted_application_id) {
    const byId = candidates.find((c) => c.id === lead.promoted_application_id);
    if (byId) return byId;
  }

  if (lead.posting_id) {
    const byPostingId = candidates.find(
      (c) => c.posting_id === lead.posting_id,
    );
    if (byPostingId) return byPostingId;
  }

  if (lead.company && lead.role) {
    const byCompanyRole = candidates.find(
      (c) => c.company === lead.company && c.role === lead.role,
    );
    if (byCompanyRole) return byCompanyRole;
  }

  return null;
}
