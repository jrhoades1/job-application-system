// Shared markdown-to-HTML renderer for PDF export.
// Keep styling in sync with the .docx export in document-export.ts.

function isContactLine(line: string): boolean {
  const hasEmail = /@/.test(line);
  const hasPhone = /\d{3}[.\-)\s]\d{3}/.test(line);
  const hasLinkedin = /linkedin/i.test(line);
  const hasPipes = (line.match(/\|/g) ?? []).length >= 1;
  return hasPipes && (hasEmail || hasPhone || hasLinkedin);
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

export function markdownToHtml(md: string): string {
  let seenSection = false;
  return md
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return "";
      if (t.startsWith("### ")) return `<h3>${inlineHtml(t.slice(4))}</h3>`;
      if (t.startsWith("## ")) {
        seenSection = true;
        return `<h2>${inlineHtml(t.slice(3))}</h2>`;
      }
      if (t.startsWith("# ")) return `<h1>${inlineHtml(t.slice(2))}</h1>`;
      if (/^[-*]{3,}$/.test(t)) return "<hr>";
      if (/^[-*•]\s/.test(t))
        return `<li>${inlineHtml(t.replace(/^[-*•]\s+/, ""))}</li>`;
      if (!seenSection && isContactLine(t))
        return `<p class="contact" style="text-align:center">${inlineHtml(t)}</p>`;
      return `<p>${inlineHtml(t)}</p>`;
    })
    .join("\n")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
}

export function buildPdfHtml(content: string, title: string): string {
  const body = markdownToHtml(content);
  const safeTitle = title.replace(/[<>&"']/g, "");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    body {
      font-family: 'Calibri', 'Segoe UI', sans-serif;
      font-size: 10.5pt;
      line-height: 1.15;
      color: #374151;
      margin: 0;
    }
    h1 { font-size: 16pt; margin-bottom: 2pt; color: #1F2937; text-align: center; }
    h1 + .contact, h1 + p { text-align: center; }
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
    @page { size: Letter; margin: 0.75in; }
  </style>
</head>
<body>${body}</body>
</html>`;
}
