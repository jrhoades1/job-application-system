"use client";

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { saveAs } from "file-saver";

/**
 * Download content as a markdown file.
 */
export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, filename.endsWith(".md") ? filename : `${filename}.md`);
}

/**
 * Parse markdown content into docx paragraphs and trigger download.
 */
export async function downloadDocx(content: string, filename: string) {
  const paragraphs = parseMarkdownToParagraphs(content);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(
    blob,
    filename.endsWith(".docx") ? filename : `${filename}.docx`
  );
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
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.5;
      max-width: 7in;
      margin: 0.5in auto;
      color: #222;
    }
    h1 { font-size: 18pt; margin-bottom: 4pt; }
    h2 { font-size: 14pt; margin-top: 12pt; margin-bottom: 4pt; }
    h3 { font-size: 12pt; margin-top: 10pt; margin-bottom: 4pt; }
    ul, ol { margin: 4pt 0; padding-left: 20pt; }
    li { margin-bottom: 2pt; }
    p { margin: 4pt 0; }
    hr { border: none; border-top: 1px solid #ccc; margin: 12pt 0; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>${html}</body>
</html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

function parseMarkdownToParagraphs(md: string): Paragraph[] {
  const lines = md.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: parseInlineFormatting(trimmed.slice(4)),
          spacing: { before: 200, after: 80 },
        })
      );
    } else if (trimmed.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: parseInlineFormatting(trimmed.slice(3)),
          spacing: { before: 240, after: 80 },
        })
      );
    } else if (trimmed.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: parseInlineFormatting(trimmed.slice(2)),
          spacing: { after: 120 },
          alignment: AlignmentType.CENTER,
        })
      );
    }
    // Horizontal rule
    else if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          border: { bottom: { style: "single" as never, size: 1, color: "999999" } },
          spacing: { before: 120, after: 120 },
        })
      );
    }
    // Bullet points
    else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineFormatting(trimmed.slice(2)),
          spacing: { after: 40 },
        })
      );
    }
    // Normal paragraph
    else {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed),
          spacing: { after: 60 },
        })
      );
    }
  }

  return paragraphs;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Match **bold**, *italic*, and plain text
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // Bold
      runs.push(new TextRun({ text: match[2], bold: true, size: 22 }));
    } else if (match[3]) {
      // Italic
      runs.push(new TextRun({ text: match[3], italics: true, size: 22 }));
    } else if (match[4]) {
      // Plain
      runs.push(new TextRun({ text: match[4], size: 22 }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: 22 }));
  }

  return runs;
}

function markdownToHtml(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return "";
      if (t.startsWith("### ")) return `<h3>${inlineHtml(t.slice(4))}</h3>`;
      if (t.startsWith("## ")) return `<h2>${inlineHtml(t.slice(3))}</h2>`;
      if (t.startsWith("# ")) return `<h1>${inlineHtml(t.slice(2))}</h1>`;
      if (/^-{3,}$/.test(t) || /^\*{3,}$/.test(t)) return "<hr>";
      if (t.startsWith("- ") || t.startsWith("* "))
        return `<li>${inlineHtml(t.slice(2))}</li>`;
      return `<p>${inlineHtml(t)}</p>`;
    })
    .join("\n")
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
}

function inlineHtml(text: string): string {
  // Escape HTML entities first
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Then apply markdown inline formatting
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}
