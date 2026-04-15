/**
 * Greenhouse vendor scanner.
 *
 * Public API — no auth required:
 *   https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
 *
 * Returns { jobs: [{ id, title, absolute_url, location: { name }, departments }] }.
 * We normalize to JobListing. No pagination — Greenhouse returns the full
 * board in one response even for very large companies.
 */

import { z } from "zod";
import type { JobListing } from "../types";

const GreenhouseJobSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  title: z.string(),
  absolute_url: z.string().url(),
  location: z.object({ name: z.string().optional() }).optional().nullable(),
  departments: z
    .array(z.object({ name: z.string().optional() }))
    .optional()
    .default([]),
});

const GreenhouseResponseSchema = z.object({
  jobs: z.array(GreenhouseJobSchema),
});

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB cap

export async function scanGreenhouse(slug: string): Promise<JobListing[]> {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    throw new Error(`Invalid Greenhouse slug: ${slug}`);
  }

  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    slug
  )}/jobs`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let rawText: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Greenhouse returned ${res.status} for ${slug}`);
    }
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      throw new Error(`Greenhouse response too large: ${contentLength} bytes`);
    }
    rawText = await res.text();
    if (rawText.length > MAX_BODY_BYTES) {
      throw new Error(`Greenhouse response too large: ${rawText.length} bytes`);
    }
  } finally {
    clearTimeout(timer);
  }

  const parsed = GreenhouseResponseSchema.parse(JSON.parse(rawText));

  return parsed.jobs.map((j) => ({
    externalId: j.id,
    title: j.title,
    url: j.absolute_url,
    location: j.location?.name || undefined,
    department: j.departments?.[0]?.name || undefined,
  }));
}
