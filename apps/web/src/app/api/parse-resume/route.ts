import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase";
import { createTrackedMessage, SpendCapExceededError } from "@/lib/anthropic";
import { buildParseResumePrompt } from "@/ai/parse-resume";

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

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    if (err instanceof SpendCapExceededError) {
      return NextResponse.json(
        { error: "Monthly AI spend cap exceeded", cap: err.cap },
        { status: 429 }
      );
    }
    console.error("Parse resume error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
