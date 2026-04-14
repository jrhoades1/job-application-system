import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createApplicationSchema } from "@/schemas/application";

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const search = searchParams.get("search");
    const appliedFrom = searchParams.get("from"); // inclusive (YYYY-MM-DD)
    const appliedTo = searchParams.get("to"); // exclusive (YYYY-MM-DD)
    const sortBy = searchParams.get("sort") ?? "created_at";
    const sortOrder = searchParams.get("order") ?? "desc";
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const safeFrom = appliedFrom && dateRe.test(appliedFrom) ? appliedFrom : null;
    const safeTo = appliedTo && dateRe.test(appliedTo) ? appliedTo : null;

    const allowedSortColumns = ["company", "role", "status", "source", "applied_date", "created_at"];
    const safeSort = allowedSortColumns.includes(sortBy) ? sortBy : "created_at";
    const safeOrder = sortOrder === "asc";

    let query = supabase
      .from("applications")
      .select("id, company, role, status, source, applied_date, created_at, match_scores(overall, match_percentage, strong_count, partial_count, gap_count)", { count: "exact" })
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .order(safeSort, { ascending: safeOrder })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`company.ilike.%${search}%,role.ilike.%${search}%`);
    }
    if (status) {
      const statuses = status.split(",").map((s) => s.trim());
      if (statuses.length === 1) {
        query = query.eq("status", statuses[0]);
      } else {
        query = query.in("status", statuses);
      }
    }
    if (source) {
      query = query.eq("source", source);
    }
    if (safeFrom) {
      query = query.gte("applied_date", safeFrom);
    }
    if (safeTo) {
      query = query.lt("applied_date", safeTo);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ data, count });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedClient();
    const body = await req.json();

    const parsed = createApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("applications")
      .insert({ ...parsed.data, clerk_user_id: userId })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
