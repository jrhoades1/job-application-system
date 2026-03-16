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
 * Open a print dialog with styled content so the user can save as PDF.
 */
export function downloadPdf(content: string, filename: string) {
  const html = markdownToHtml(content);
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow popups to download PDF");
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${filename}</title>
  <style>
    body {
      font-family: 'Calibri', 'Segoe UI', sans-serif;
      font-size: 10.5pt;
      line-height: 1.15;
      max-width: 7in;
      margin: 0.75in auto;
      color: #374151;
    }
    h1 { font-size: 16pt; margin-bottom: 2pt; color: #1F2937; }
    h2 {
      font-size: 12pt; font-weight: bold; color: #1F2937;
      border-bottom: 1pt solid #1F2937; padding-bottom: 2pt;
      margin-top: 10pt; margin-bottom: 4pt;
      text-transform: uppercase;
    }
    h3 { font-size: 11pt; margin-top: 8pt; margin-bottom: 1pt; color: #1F2937; }
    ul { margin: 2pt 0; padding-left: 18pt; list-style-type: disc; }
    li { margin-bottom: 2pt; }
    p { margin: 2pt 0; }
    .contact { font-size: 10pt; color: #374151; margin-bottom: 4pt; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    @media print {
      body { margin: 0; max-width: none; }
    }
  </style>
</head>
<body>${html}</body>
</html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
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
    alignment: AlignmentType.LEFT,
    spacing: { after: 40 },
    children: [
      new TextRun({ text: name, font: FONT, size: NAME_SIZE, bold: true, color: NAVY }),
    ],
  });
}

function makeContact(line: string): Paragraph {
  return new Paragraph({
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

// ─── HTML export (for PDF print) ───

function markdownToHtml(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return "";
      if (t.startsWith("### ")) return `<h3>${inlineHtml(t.slice(4))}</h3>`;
      if (t.startsWith("## ")) return `<h2>${inlineHtml(t.slice(3))}</h2>`;
      if (t.startsWith("# ")) return `<h1>${inlineHtml(t.slice(2))}</h1>`;
      if (/^[-*]{3,}$/.test(t)) return "<hr>";
      if (/^[-*•]\s/.test(t))
        return `<li>${inlineHtml(t.replace(/^[-*•]\s+/, ""))}</li>`;
      return `<p>${inlineHtml(t)}</p>`;
    })
    .join("\n")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
}

function inlineHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}
