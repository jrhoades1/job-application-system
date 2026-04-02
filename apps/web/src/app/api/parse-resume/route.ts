import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage } from "@/lib/anthropic";
import { buildParseResumePrompt } from "@/ai/parse-resume";

const resumeResponseSchema = z.object({
  full_name: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  linkedin_url: z.string().nullable().default(null),
  narrative: z.string().default(""),
  work_history: z.array(z.object({
    company: z.string(),
    title: z.string(),
    start_date: z.string(),
    end_date: z.string().nullable().default(null),
    current: z.boolean().default(false),
  })).default([]),
  achievements: z.array(z.object({
    category: z.string(),
    items: z.array(z.object({
      text: z.string(),
    })),
  })).default([]),
});

const MAX_FILE_SIZE = 500 * 1024; // 500 KB
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export async function POST(req: Request) {
  try {
    await getAuthenticatedClient(); // Verify auth — throws if unauthenticated

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 500 KB." },
        { status: 400 }
      );
    }

    const mimeType = file.type;
    if (!ACCEPTED_TYPES.includes(mimeType) && !file.name.endsWith(".txt")) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a PDF, DOCX, or TXT file." },
        { status: 400 }
      );
    }

    // Extract text from the file
    let resumeText = "";

    if (mimeType === "application/pdf" || file.name.endsWith(".pdf")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParseModule: any = await import("pdf-parse");
      const pdfParse = pdfParseModule.default ?? pdfParseModule;
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await pdfParse(buffer);
      resumeText = parsed.text;
    } else if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.endsWith(".docx")
    ) {
      const mammoth = await import("mammoth");
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      resumeText = result.value;
    } else {
      // Plain text
      resumeText = await file.text();
    }

    resumeText = resumeText.trim();
    if (resumeText.length < 100) {
      return NextResponse.json(
        { error: "Could not extract text from the file. Try a plain text (.txt) version." },
        { status: 422 }
      );
    }

    // Truncate very long resumes (keep first ~8000 chars — plenty for parsing)
    if (resumeText.length > 8000) {
      resumeText = resumeText.slice(0, 8000);
    }

    const prompt = buildParseResumePrompt(resumeText);

    const response = await createTrackedMessage(
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      },
      "parse_resume"
    );

    const raw =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response (Claude may add prose around it)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not parse AI response" },
        { status: 500 }
      );
    }

    const rawParsed = JSON.parse(jsonMatch[0]);
    const validated = resumeResponseSchema.safeParse(rawParsed);
    if (!validated.success) {
      return NextResponse.json(
        { error: "AI returned an unexpected response format" },
        { status: 500 }
      );
    }

    const resumeData = validated.data;

    // Ensure narrative is populated — if Claude omitted it, synthesize from achievements
    if (!resumeData.narrative || resumeData.narrative.trim().length === 0) {
      const name = resumeData.full_name || "This candidate";
      const categories = resumeData.achievements
        .map((a) => a.category)
        .slice(0, 4);
      if (categories.length > 0) {
        const fallbackPrompt = `Based on a resume for "${name}" with expertise in: ${categories.join(", ")} — write a 2-3 sentence career positioning statement in first person. Return ONLY the narrative text, no JSON, no quotes.`;
        const fallbackResp = await createTrackedMessage(
          {
            model: "claude-sonnet-4-20250514",
            max_tokens: 300,
            messages: [{ role: "user", content: fallbackPrompt }],
          },
          "parse_resume_narrative_fallback"
        );
        const narrativeText =
          fallbackResp.content[0].type === "text"
            ? fallbackResp.content[0].text.trim()
            : "";
        if (narrativeText.length > 20) {
          resumeData.narrative = narrativeText;
        }
      }
    }

    return NextResponse.json(resumeData);
  } catch (err) {
    console.error("Parse resume error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
