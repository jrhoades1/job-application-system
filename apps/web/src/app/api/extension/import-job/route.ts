import { NextResponse } from "next/server";
import { getExtensionClient } from "@/lib/extension-auth";
import { z } from "zod";

const importSchema = z.object({
  url: z.string().url(),
  job_description: z.string().min(50).max(50000),
  role: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  salary: z.string().max(200).optional(),
});

/**
 * POST /api/extension/import-job
 *
 * Creates an application directly from the Chrome extension's "Import Job" button.
 * Requires JD — won't create without one. Deduplicates by source_url.
 */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getExtensionClient(req);
    const body = await req.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url, job_description, role, company, location } = parsed.data;

    // Check for duplicate by source_url
    const { data: existing } = await supabase
      .from("applications")
      .select("id, company, role, status")
      .eq("clerk_user_id", userId)
      .eq("source_url", url)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      // Update JD if it was missing
      if (!existing.status) {
        return NextResponse.json({
          imported: false,
          duplicate: true,
          application_id: existing.id,
          company: existing.company,
          role: existing.role,
        });
      }

      // Update JD on existing app if it doesn't have one
      await supabase
        .from("applications")
        .update({ job_description })
        .eq("id", existing.id)
        .eq("clerk_user_id", userId);

      return NextResponse.json({
        imported: false,
        duplicate: true,
        jd_updated: true,
        application_id: existing.id,
        company: existing.company,
        role: existing.role,
      });
    }

    // Infer source platform from URL
    const host = new URL(url).hostname.toLowerCase();
    let source = "Direct";
    if (host.includes("linkedin")) source = "LinkedIn";
    else if (host.includes("indeed")) source = "Indeed";
    else if (host.includes("ziprecruiter")) source = "ZipRecruiter";
    else if (host.includes("glassdoor")) source = "Glassdoor";
    else if (host.includes("greenhouse")) source = "Greenhouse";
    else if (host.includes("lever")) source = "Lever";
    else if (host.includes("workday") || host.includes("myworkdayjobs")) source = "Workday";
    else if (host.includes("smartrecruiters")) source = "SmartRecruiters";
    else if (host.includes("ashby")) source = "Ashby";

    // Create the application
    const { data: app, error } = await supabase
      .from("applications")
      .insert({
        clerk_user_id: userId,
        company,
        role,
        location: location ?? null,
        source,
        source_url: url,
        job_description,
        status: "evaluating",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Seed status history
    await supabase.from("application_status_history").insert({
      application_id: app.id,
      clerk_user_id: userId,
      from_status: null,
      to_status: "evaluating",
      source: "extension_import",
    });

    return NextResponse.json({
      imported: true,
      application_id: app.id,
      company,
      role,
      source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Unauthorized") || message.includes("Invalid token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
