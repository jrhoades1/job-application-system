/**
 * Target Companies API — CRUD for career scan watchlist.
 *
 * GET  → list the caller's active target companies
 * POST → add one; body: { careersUrl, companyName? }. Auto-detects vendor
 *        + slug from the URL. Rejects URLs we can't map to a vendor yet.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { detectVendor } from "@/career-scan";

const AddTargetSchema = z.object({
  careersUrl: z.string().url().max(500),
  companyName: z.string().trim().min(1).max(200).optional(),
});

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const { data, error } = await supabase
      .from("target_companies")
      .select("id, company_name, careers_url, ats_vendor, ats_identifier, active, last_scanned_at, last_error, created_at")
      .eq("clerk_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ targets: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const body = await req.json();
    const parsed = AddTargetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const detection = detectVendor(parsed.data.careersUrl);
    if (!detection) {
      return NextResponse.json(
        {
          error:
            "Unrecognized careers URL. Supported: Greenhouse, Workday. More vendors coming soon.",
        },
        { status: 400 }
      );
    }

    const supportedVendors = new Set(["greenhouse", "workday"]);
    if (!supportedVendors.has(detection.vendor)) {
      return NextResponse.json(
        {
          error: `Vendor '${detection.vendor}' detected but not yet implemented. Supported: Greenhouse, Workday.`,
        },
        { status: 400 }
      );
    }

    // For Workday, derive a readable name from the tenant slug (first part of
    // the 3-part identifier). For Greenhouse, use the whole identifier.
    const slugForName =
      detection.vendor === "workday"
        ? detection.identifier.split("/")[0]
        : detection.identifier;
    const companyName =
      parsed.data.companyName?.trim() ||
      slugForName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const { data, error } = await supabase
      .from("target_companies")
      .insert({
        clerk_user_id: userId,
        company_name: companyName,
        careers_url: parsed.data.careersUrl,
        ats_vendor: detection.vendor,
        ats_identifier: detection.identifier,
      })
      .select("id, company_name, careers_url, ats_vendor, ats_identifier, active, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "You're already watching this company." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ target: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
