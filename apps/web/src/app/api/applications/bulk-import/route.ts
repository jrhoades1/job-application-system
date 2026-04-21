import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import * as cheerio from "cheerio";
import { z } from "zod";
import {
  JD_SELECTORS,
  TITLE_SELECTORS,
  COMPANY_SELECTORS,
  extractFromJsonLd,
  extractWithSelectors,
  extractDescription,
  inferSourceFromUrl,
  isPrivateUrl,
} from "@/lib/scrape-helpers";
import { classifyForWrite } from "@/lib/classify-on-write";

const bulkImportSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(20),
});

async function scrapeUrl(url: string) {
  if (isPrivateUrl(url)) return { error: "URL not allowed" };

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { error: `HTTP ${res.status}` };

    const html = await res.text();
    if (html.length > 2_000_000) return { error: "Page too large" };

    const $ = cheerio.load(html);
    const jsonLd = extractFromJsonLd($);

    const company = jsonLd.company || extractWithSelectors($, COMPANY_SELECTORS) || "";
    const role = jsonLd.title || extractWithSelectors($, TITLE_SELECTORS) || "";
    const rawDesc = jsonLd.description || extractDescription($, JD_SELECTORS) || "";
    const description = rawDesc ? cheerio.load(rawDesc).text().trim().slice(0, 50000) : "";

    return { company, role, description, source: inferSourceFromUrl(url), source_url: url };
  } catch (err) {
    return { error: err instanceof Error && err.name === "TimeoutError" ? "Timeout" : "Failed to fetch" };
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();
    const parsed = bulkImportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const results: Array<{
      url: string;
      status: "created" | "failed";
      company?: string;
      role?: string;
      error?: string;
      id?: string;
    }> = [];

    // Process URLs sequentially to avoid hammering servers
    for (const url of parsed.data.urls) {
      const scraped = await scrapeUrl(url);

      if ("error" in scraped) {
        results.push({ url, status: "failed", error: scraped.error });
        continue;
      }

      if (!scraped.company && !scraped.role) {
        results.push({ url, status: "failed", error: "Could not extract job details" });
        continue;
      }

      const archetypeFields = classifyForWrite({
        role: scraped.role,
        jd: scraped.description,
      });

      const { data, error } = await supabase
        .from("applications")
        .insert({
          company: scraped.company || "Unknown",
          role: scraped.role || "Unknown",
          source: scraped.source,
          source_url: scraped.source_url,
          job_description: scraped.description,
          clerk_user_id: userId,
          status: "evaluating",
          ...archetypeFields,
        })
        .select("id")
        .single();

      if (error) {
        results.push({ url, status: "failed", error: "Database error" });
        continue;
      }

      results.push({
        url,
        status: "created",
        company: scraped.company,
        role: scraped.role,
        id: data.id,
      });
    }

    // Auto-score all successfully created apps that have descriptions
    const createdIds = results
      .filter((r) => r.status === "created" && r.id)
      .map((r) => r.id!);

    // Fire scoring in background (don't await)
    if (createdIds.length > 0) {
      // Import scoring modules
      const { extractRequirements, scoreRequirement, calculateOverallScore } = await import("@/scoring");

      const { data: profile } = await supabase
        .from("profiles")
        .select("achievements")
        .eq("clerk_user_id", userId)
        .single();

      const achievementsMap: Record<string, string[]> = {};
      const achievements = profile?.achievements ?? [];
      if (Array.isArray(achievements)) {
        for (const cat of achievements) {
          if (cat.category && Array.isArray(cat.items)) {
            achievementsMap[cat.category] = cat.items.map(
              (i: { text: string }) => i.text
            );
          }
        }
      }

      // Score each app
      const { data: apps } = await supabase
        .from("applications")
        .select("id, job_description")
        .in("id", createdIds)
        .not("job_description", "is", null);

      if (apps) {
        for (const app of apps) {
          if (!app.job_description) continue;
          const requirements = extractRequirements(app.job_description);
          const allReqs = [...requirements.hard_requirements, ...requirements.preferred];
          const matches = allReqs.map((r) => scoreRequirement(r, achievementsMap));
          const score = calculateOverallScore(matches);

          await supabase.from("match_scores").upsert(
            {
              application_id: app.id,
              clerk_user_id: userId,
              overall: score.overall,
              match_percentage: score.match_percentage,
              strong_count: score.strong_count,
              partial_count: score.partial_count,
              gap_count: score.gap_count,
              red_flags: requirements.red_flags,
            },
            { onConflict: "application_id" }
          );
        }
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({ results, summary: { created, failed, total: results.length } });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
