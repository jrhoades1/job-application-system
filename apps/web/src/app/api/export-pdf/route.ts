import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { buildPdfHtml } from "@/lib/pdf-html";

export const runtime = "nodejs";
export const maxDuration = 60;

const exportSchema = z.object({
  content: z.string().min(1).max(200_000),
  filename: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { content, filename } = parsed.data;
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const html = buildPdfHtml(content, safeFilename);

  const isLocal = process.env.NODE_ENV === "development";
  const browser = await puppeteer.launch({
    args: isLocal ? ["--no-sandbox"] : chromium.args,
    executablePath: isLocal
      ? process.env.PUPPETEER_EXECUTABLE_PATH ||
        "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "0.75in", right: "0.75in", bottom: "0.75in", left: "0.75in" },
    });

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await browser.close();
  }
}
