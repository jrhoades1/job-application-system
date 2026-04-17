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
import {
  detectVendor,
  detectRadancyAsync,
  type AtsVendor,
} from "@/career-scan";

// Workday CxS facet IDs are ~32-char opaque hex strings. Cap at 200 to be safe
// without being restrictive. Max 20 values per facet key is plenty.
const FacetValuesSchema = z.array(z.string().min(1).max(200)).max(20);

const AppliedFacetsSchema = z
  .record(z.string().min(1).max(100), FacetValuesSchema)
  .refine((obj) => Object.keys(obj).length <= 10, {
    message: "Max 10 facet keys",
  });

const AddTargetSchema = z.object({
  careersUrl: z.string().url().max(500),
  companyName: z.string().trim().min(1).max(200).optional(),
  appliedFacets: AppliedFacetsSchema.optional(),
});

export async function GET() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    const { data, error } = await supabase
      .from("target_companies")
      .select("id, company_name, careers_url, ats_vendor, ats_identifier, active, last_scanned_at, last_error, applied_facets, created_at")
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

    // 1. Try sync URL-pattern detection (fast).
    let detection: { vendor: AtsVendor; identifier: string } | null =
      detectVendor(parsed.data.careersUrl);

    // 2. Radancy sites live on the company's own hostname, so regex can't
    //    catch them. Probe the URL for TalentBrew markers + company-site-id.
    if (!detection) {
      const radancyIdentifier = await detectRadancyAsync(
        parsed.data.careersUrl
      );
      if (radancyIdentifier) {
        detection = { vendor: "radancy", identifier: radancyIdentifier };
      }
    }

    if (!detection) {
      return NextResponse.json(
        {
          error:
            "Unrecognized careers URL. Supported: Greenhouse, Workday, Radancy, iCIMS.",
        },
        { status: 400 }
      );
    }

    const supportedVendors = new Set<AtsVendor>([
      "greenhouse",
      "workday",
      "radancy",
      "icims",
    ]);
    if (!supportedVendors.has(detection.vendor)) {
      return NextResponse.json(
        {
          error: `Vendor '${detection.vendor}' detected but not yet implemented. Supported: Greenhouse, Workday, Radancy, iCIMS.`,
        },
        { status: 400 }
      );
    }

    // Derive a readable default name from the identifier.
    // - Workday: `{tenant}/{wdN}/{site}` — use tenant
    // - Radancy: `{hostname}/{companySiteId}` — use hostname minus TLD
    // - iCIMS/Greenhouse: identifier is already the slug
    let slugForName = detection.identifier;
    if (detection.vendor === "workday") {
      slugForName = detection.identifier.split("/")[0];
    } else if (detection.vendor === "radancy") {
      const hostname = detection.identifier.split("/")[0];
      slugForName =
        hostname.replace(/^careers?\./, "").split(".")[0] || hostname;
    }
    const companyName =
      parsed.data.companyName?.trim() ||
      slugForName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    // Only persist facets for Workday — on other vendors they'd be dead weight
    // and could surprise a future maintainer.
    const appliedFacets =
      detection.vendor === "workday" ? (parsed.data.appliedFacets ?? {}) : {};

    const { data, error } = await supabase
      .from("target_companies")
      .insert({
        clerk_user_id: userId,
        company_name: companyName,
        careers_url: parsed.data.careersUrl,
        ats_vendor: detection.vendor,
        ats_identifier: detection.identifier,
        applied_facets: appliedFacets,
      })
      .select("id, company_name, careers_url, ats_vendor, ats_identifier, active, applied_facets, created_at")
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
