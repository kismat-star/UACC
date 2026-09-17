import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * GET /api/print/[id]
 * Returns an HTML document that embeds the file (image or PDF via iframe) and
 * calls window.print() once the resource has loaded.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validate id so it can't break out of the URL attribute.
  const safeId = encodeURIComponent(id);

  const file = await db.file.findUnique({ where: { id } });
  if (!file) {
    const notFoundHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title></head><body style="font-family:system-ui;display:flex;height:100vh;align-items:center;justify-content:center;color:#666"><p>File not found.</p></body></html>`;
    return new NextResponse(notFoundHtml, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const title = escapeHtml(`Print — ${file.filename}`);
  const fileUrl = `/api/files/${safeId}`;

  let html: string;
  if (file.fileType === "image") {
    html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#fff">
    <img src="${fileUrl}" alt="${escapeHtml(file.filename)}" style="max-width:100%;height:auto" onload="setTimeout(()=>window.print(),300)">
  </body>
</html>`;
  } else {
    // PDF: embed via iframe so the browser's native viewer renders it.
    html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style>
  </head>
  <body>
    <iframe src="${fileUrl}" onload="setTimeout(()=>window.print(),600)"></iframe>
  </body>
</html>`;
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
