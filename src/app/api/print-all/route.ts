import { db } from "@/lib/db";
import { toFileShape } from "@/lib/types";

/**
 * GET /api/print-all?ids=id1,id2,id3
 * Returns a print-optimized HTML page that lays out every selected file on
 * its own page (with page breaks) and auto-triggers window.print(). Best for
 * printing a batch of student photo submissions in one go. PDFs are embedded
 * as iframes (the browser shows them in the print output where supported).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return new Response("No files selected", { status: 400 });
  }

  // Keep order, fetch only existing + non-expired files.
  const now = new Date();
  const files = (
    await db.file.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sessionId: true,
        filename: true,
        storedName: true,
        mimeType: true,
        size: true,
        fileType: true,
        pageCount: true,
        studentName: true,
        createdAt: true,
        printedAt: true,
        printed: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "asc" },
    })
  )
    .filter((f) => !f.expiresAt || f.expiresAt.getTime() >= now.getTime())
    .map(toFileShape);

  if (files.length === 0) {
    return new Response("No printable files", { status: 400 });
  }

  const pages = files
    .map((f, i) => {
      const caption = `${i + 1}. ${escapeHtml(f.studentName || "Anonymous")} — ${escapeHtml(f.filename)}`;
      const body =
        f.fileType === "image"
          ? `<img src="/api/files/${encodeURIComponent(f.id)}" alt="${escapeHtml(f.filename)}">`
          : `<iframe src="/api/files/${encodeURIComponent(f.id)}" title="${escapeHtml(f.filename)}"></iframe>`;
      return `<section class="page">${body}<div class="caption">${caption}</div></section>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Print ${files.length} file(s)</title>
<style>
  @page { margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; }
  .page { width: 100%; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; break-after: page; gap: 8px; padding: 8px; }
  .page:last-child { page-break-after: auto; }
  .page img { max-width: 100%; max-height: 88vh; object-fit: contain; box-shadow: 0 4px 16px -6px rgba(2,6,23,.2); }
  .page iframe { width: 100%; height: 88vh; border: 0; }
  .caption { font-size: 13px; color: #475569; text-align: center; max-width: 90%; word-break: break-word; }
  .print-btn { position: fixed; right: 24px; bottom: 24px; background: #10b981; color: #fff; border: none; border-radius: 12px; padding: 12px 18px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 12px 30px -8px rgba(16,185,129,.5); }
  @media print { .print-btn { display: none !important; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Print ${files.length} page(s)</button>
  ${pages}
  <script>setTimeout(function(){try{window.print()}catch(e){}},500);</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
