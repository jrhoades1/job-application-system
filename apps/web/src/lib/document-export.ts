"use client";

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  TabStopType,
  TabStopPosition,
  BorderStyle,
  convertInchesToTwip,
} from "docx";
import { saveAs } from "file-saver";

// -- Colors & sizes from docx-format.md spec --
const NAVY = "1F2937";
const GRAY = "374151";
const FONT = "Calibri";
const NAME_SIZE = 32; // 16pt in half-points
const SECTION_HEADER_SIZE = 24; // 12pt
const ROLE_TITLE_SIZE = 22; // 11pt
const BODY_SIZE = 21; // 10.5pt
const CONTACT_SIZE = 20; // 10pt
const DATE_SIZE = 20; // 10pt

/**
 * Download content as a markdown file.
 */
export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, filename.endsWith(".md") ? filename : `${filename}.md`);
}

/**
 * Parse resume markdown into a professionally formatted .docx and trigger download.
 */
export async function downloadDocx(content: string, filename: string) {
  const paragraphs = parseResumeMarkdown(content);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE, color: GRAY },
          paragraph: { spacing: { line: 276 } }, // 1.15 line spacing
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename.endsWith(".docx") ? filename : `${filename}.docx`);
}

/**
 * Server-rendered PDF download. POSTs content to /api/export-pdf which
 * uses headless Chromium to produce a real PDF file.
 */
export async function downloadPdf(content: string, filename: string) {
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, filename }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "PDF export failed" }));
    throw new Error(err.error || "PDF export failed");
  }

  const blob = await res.blob();
  saveAs(blob, filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

// ─── Resume-aware markdown → docx parser ───

/** Detect if a line looks like contact info (email, phone, linkedin, pipes) */
function isContactLine(line: string): boolean {
  const hasEmail = /@/.test(line);
  const hasPhone = /\d{3}[.\-)\s]\d{3}/.test(line);
  const hasLinkedin = /linkedin/i.test(line);
  const hasPipes = (line.match(/\|/g) ?? []).length >= 1;
  return hasPipes && (hasEmail || hasPhone || hasLinkedin);
}

/**
 * Detect a role/title line: **Title** | Company | Dates
 * or **Title** | Dates
 */
function parseRoleLine(line: string): { title: string; rest: string } | null {
  const m = line.match(/^\*\*(.+?)\*\*\s*\|\s*(.+)$/);
  if (!m) return null;
  return { title: m[1], rest: m[2] };
}

/**
 * Detect a date pattern at the end of a string, like "Oct 2023 - Present" or "2022-08 – 2023-09"
 */
function splitDatesFromEnd(text: string): { before: string; dates: string } | null {
  // Match common date patterns at end: "Mon YYYY – Present", "YYYY-MM – YYYY-MM", "MM/YYYY - MM/YYYY"
  const datePattern = /\|?\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}(?:\s*[-–—]\s*(?:\d{2})?)?\s*[-–—]\s*(?:Present|Current|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}(?:\s*[-–—]\s*\d{2})?))$/i;
  const m = text.match(datePattern);
  if (m) {
    const dates = m[1].trim();
    const before = text.slice(0, m.index).replace(/\|\s*$/, "").trim();
    return { before, dates };
  }
  return null;
}

function parseResumeMarkdown(md: string): Paragraph[] {
  const lines = md.split("\n");
  const paragraphs: Paragraph[] = [];
  let seenName = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip empty lines
    if (!trimmed) continue;

    // ── H1 = Name ──
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      const name = trimmed.slice(2).trim();
      paragraphs.push(makeName(name));
      seenName = true;
      continue;
    }

    // ── H2 = Section header ──
    if (trimmed.startsWith("## ")) {
      const header = trimmed.slice(3).trim();
      paragraphs.push(makeSectionHeader(header));
      continue;
    }

    // ── H3 = Company/sub-header ──
    if (trimmed.startsWith("### ")) {
      const text = trimmed.slice(4).trim();
      // Check if dates are embedded: ### Company | City | Dates
      const dateSplit = splitDatesFromEnd(text);
      if (dateSplit) {
        paragraphs.push(makeRoleHeader(dateSplit.before, dateSplit.dates));
      } else {
        paragraphs.push(makeCompanyLine(text));
      }
      continue;
    }

    // ── Contact line (pipe-separated with email/phone/linkedin) ──
    if (!seenName && isContactLine(trimmed) && paragraphs.length <= 3) {
      // First non-heading line that looks like contact → treat as contact
      paragraphs.push(makeContact(trimmed));
      continue;
    }
    if (seenName && isContactLine(trimmed) && paragraphs.length <= 3) {
      paragraphs.push(makeContact(trimmed));
      continue;
    }

    // ── Horizontal rule ──
    if (/^[-*]{3,}$/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999", space: 1 } },
          spacing: { before: 60, after: 60 },
        })
      );
      continue;
    }

    // ── Bullet points ──
    if (/^[-*•]\s/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[-*•]\s+/, "");
      paragraphs.push(makeBullet(bulletText));
      continue;
    }

    // ── Role line: **Title** | Company | Dates  OR  **Title** | Dates ──
    const role = parseRoleLine(trimmed);
    if (role) {
      const dateSplit = splitDatesFromEnd(role.rest);
      if (dateSplit) {
        // **Title** | Company | Dates → show "Title — Company" with right-aligned dates
        const label = dateSplit.before ? `${role.title} — ${dateSplit.before}` : role.title;
        paragraphs.push(makeRoleHeader(label, dateSplit.dates));
      } else {
        // **Title** | something (no clear dates) → just bold line
        paragraphs.push(makeRoleHeader(`${role.title} — ${role.rest}`, ""));
      }
      continue;
    }

    // ── Education: **School** - Degree ──
    const eduMatch = trimmed.match(/^\*\*(.+?)\*\*\s*[-—–]\s*(.+)$/);
    if (eduMatch) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: eduMatch[1], font: FONT, size: BODY_SIZE, bold: true, color: GRAY }),
            new TextRun({ text: `  —  ${eduMatch[2]}`, font: FONT, size: BODY_SIZE, color: GRAY }),
          ],
        })
      );
      continue;
    }

    // ── Normal paragraph (summary text, skills lines, etc.) ──
    paragraphs.push(
      new Paragraph({
        spacing: { after: 40 },
        children: parseInlineFormatting(trimmed, BODY_SIZE, GRAY),
      })
    );
  }

  return paragraphs;
}

// ─── Paragraph builders ───

function makeName(name: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [
      new TextRun({ text: name, font: FONT, size: NAME_SIZE, bold: true, color: NAVY }),
    ],
  });
}

function makeContact(line: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [
      new TextRun({ text: line, font: FONT, size: CONTACT_SIZE, color: GRAY }),
    ],
  });
}

function makeSectionHeader(header: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: NAVY, space: 4 },
    },
    children: [
      new TextRun({
        text: header.toUpperCase(),
        font: FONT,
        size: SECTION_HEADER_SIZE,
        bold: true,
        color: NAVY,
      }),
    ],
  });
}

function makeCompanyLine(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 20 },
    children: [
      new TextRun({ text, font: FONT, size: ROLE_TITLE_SIZE, bold: true, color: NAVY }),
    ],
  });
}

function makeRoleHeader(titlePart: string, dates: string): Paragraph {
  const children: TextRun[] = [
    new TextRun({ text: titlePart, font: FONT, size: ROLE_TITLE_SIZE, bold: true, color: NAVY }),
  ];

  if (dates) {
    children.push(
      new TextRun({ text: "\t", font: FONT, size: DATE_SIZE }),
      new TextRun({ text: dates, font: FONT, size: DATE_SIZE, color: GRAY }),
    );
  }

  return new Paragraph({
    spacing: { before: 120, after: 40 },
    tabStops: dates ? [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }] : undefined,
    children,
  });
}

function makeBullet(text: string): Paragraph {
  return new Paragraph({
    indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.15) },
    spacing: { after: 40 },
    children: [
      new TextRun({ text: "\u2022  ", font: FONT, size: BODY_SIZE, color: GRAY }),
      ...parseInlineFormatting(text, BODY_SIZE, GRAY),
    ],
  });
}

// ─── Inline formatting ───

function parseInlineFormatting(
  text: string,
  size: number = BODY_SIZE,
  color: string = GRAY
): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, font: FONT, size, color }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true, font: FONT, size, color }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], font: FONT, size, color }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, font: FONT, size, color }));
  }

  return runs;
}

