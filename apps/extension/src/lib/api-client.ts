/** API client for communicating with the Job App Assistant web app */

const STORAGE_KEY = "jaa_config";

interface Config {
  apiBaseUrl: string;
  apiToken: string;
}

export async function getConfig(): Promise<Config | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? null;
}

export async function saveConfig(config: Config): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}

export async function clearConfig(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const config = await getConfig();
  if (!config) throw new Error("Not configured — open extension popup to set up");

  const url = `${config.apiBaseUrl}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiToken}`,
      ...options.headers,
    },
  });
}

export interface ProfileData {
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  work_history: {
    company: string;
    title: string;
    start_date: string;
    end_date?: string | null;
    current?: boolean;
  }[];
}

export async function fetchProfile(): Promise<ProfileData | null> {
  try {
    const res = await apiFetch("/api/extension/profile");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export interface MatchedApplication {
  id: string;
  company: string;
  role: string;
  status: string;
}

export async function matchUrl(url: string): Promise<MatchedApplication | null> {
  try {
    const res = await apiFetch(`/api/extension/match-url?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.match ?? null;
  } catch {
    return null;
  }
}

export async function markApplied(applicationId: string): Promise<boolean> {
  try {
    const res = await apiFetch("/api/extension/mark-applied", {
      method: "POST",
      body: JSON.stringify({ application_id: applicationId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface LeadNeedingJD {
  id: string;
  company: string;
  role: string;
  location: string | null;
  career_page_url: string | null;
  search_url: string;
}

export async function fetchLeadsNeedingJD(): Promise<LeadNeedingJD[]> {
  try {
    const res = await apiFetch("/api/extension/leads-needing-jd");
    if (!res.ok) return [];
    const data = await res.json();
    return data.leads ?? [];
  } catch {
    return [];
  }
}

export interface CaptureJDResult {
  matched: boolean;
  lead_id?: string;
  company?: string;
  role?: string;
  match_method?: string;
  message?: string;
}

export async function captureJobDescription(
  url: string,
  description: string,
  title?: string,
  company?: string
): Promise<CaptureJDResult | null> {
  try {
    const res = await apiFetch("/api/extension/capture-jd", {
      method: "POST",
      body: JSON.stringify({ url, description, title, company }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export interface ImportJobResult {
  imported: boolean;
  duplicate?: boolean;
  jd_updated?: boolean;
  lead_updated?: boolean;
  lead_id?: string;
  application_id?: string;
  company: string;
  role: string;
  source?: string;
}

export async function importJob(data: {
  url: string;
  job_description: string;
  role: string;
  company: string;
  location?: string;
  salary?: string;
}): Promise<ImportJobResult | null> {
  try {
    const res = await apiFetch("/api/extension/import-job", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
