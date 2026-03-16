import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage } from "@/lib/anthropic";

/**
 * POST /api/pipeline/backfill-descriptions
 *
 * One-time migration: finds leads whose description_text contains
 * the full digest email body and replaces it with a per-job description
 * extracted by AI.
 *
 * Groups leads by base email_uid (strips _N suffix), sends the shared
 * email body to AI once per group, then updates each lead with its
 * individual description.
 */
export async function POST() {
  try {
    const { supabase, userId } = await getAuthenticatedClient();

    // Find all leads that look like they have a full digest email body
    const { data: leads, error } = await supabase
      .from("pipeline_leads")
      .select("id, company, role, location, email_uid, description_text, source_platform")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .not("description_text", "is", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return NextResponse.json({ updated: 0, message: "No leads to process." });
    }

    // Identify leads that have digest email bodies (not individual JDs)
    const digestLeads = leads.filter((l) => {
      const text = (l.description_text ?? "").toLowerCase();
      if (text.length < 200) return false; // Short text is probably already a JD
      // Check for digest email markers
      return (
        text.includes("here are today") ||
        text.includes("jobs for you") ||
        text.includes("job alert") ||
        text.includes("recommended for you") ||
        text.includes("jobs matching") ||
        text.includes("new jobs") ||
        text.includes("jobs you might") ||
        text.includes("view details") // ZipRecruiter pattern
      );
    });

    if (digestLeads.length === 0) {
      return NextResponse.json({
        updated: 0,
        message: "No digest-style leads found to backfill.",
      });
    }

    // Group leads by their base email_uid (before the _N index suffix)
    const groups = new Map<string, typeof digestLeads>();
    for (const lead of digestLeads) {
      // email_uid format: "msgid_0", "msgid_1", etc.
      const base = lead.email_uid?.replace(/_\d+$/, "") ?? lead.id;
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push(lead);
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [baseUid, groupLeads] of groups) {
      // Use the first lead's description_text as the source email body
      const emailBody = groupLeads[0].description_text;
      if (!emailBody) continue;

      // Build the list of company+role pairs we need descriptions for
      const jobList = groupLeads.map((l) => ({
        id: l.id,
        company: l.company,
        role: l.role,
        location: l.location,
      }));

      try {
        const response = await createTrackedMessage(
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4000,
            messages: [
              {
                role: "user",
                content: `I have an email that contains multiple job listings. For each job below, extract the relevant details from the email body (salary, requirements, qualifications, responsibilities, skills, benefits, employment type, etc.).

Return a JSON array where each element has "company", "role", and "description". The description should contain ALL details specific to that job from the email. If a job's details aren't in the email, set description to null.

Jobs to find:
${jobList.map((j) => `- ${j.company}: ${j.role}`).join("\n")}

Email body:
${emailBody.slice(0, 16000)}

Return ONLY a JSON array. Example:
[{"company": "Acme", "role": "Engineer", "description": "Software Engineer, $120K-$150K, requires 5+ years Python..."}]`,
              },
            ],
          },
          "backfill_descriptions"
        );

        const text =
          response.content[0].type === "text" ? response.content[0].text : "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          skipped += groupLeads.length;
          continue;
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
          company: string;
          role: string;
          description: string | null;
        }[];

        // Match extracted descriptions back to leads
        for (const lead of groupLeads) {
          const match = parsed.find(
            (p) =>
              p.company.toLowerCase() === lead.company?.toLowerCase() &&
              p.role.toLowerCase() === lead.role?.toLowerCase()
          );

          const newDesc =
            match?.description ||
            `${lead.role} at ${lead.company}${lead.location ? ` — ${lead.location}` : ""}`;

          await supabase
            .from("pipeline_leads")
            .update({ description_text: newDesc })
            .eq("id", lead.id);

          updated++;
        }
      } catch (err) {
        console.error(`Backfill failed for group ${baseUid}:`, err);
        errors.push(baseUid);
        skipped += groupLeads.length;
      }
    }

    return NextResponse.json({
      updated,
      skipped,
      groups_processed: groups.size,
      errors: errors.length > 0 ? errors : undefined,
      message: `Updated ${updated} lead${updated !== 1 ? "s" : ""} across ${groups.size} email${groups.size !== 1 ? "s" : ""}.`,
    });
  } catch (err) {
    console.error("Backfill error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
