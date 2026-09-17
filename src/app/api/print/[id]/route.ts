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
 * Renders an optimized print preview document that verifies the image/PDF is
 * fully loaded and decoded before triggering window.print().
 * Includes print-friendly styles and a fallback action bar.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const safeId = encodeURIComponent(id);

  const file = await db.file.findUnique({ where: { id } });
  if (!file) {
    const notFoundHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>File Not Found — Print</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; height: 100vh; align-items: center; justify-content: center; margin: 0; background: #f8fafc; color: #334155; }
      .box { text-align: center; background: white; padding: 2rem 3rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
      h2 { margin: 0 0 0.5rem; color: #e11d48; }
      p { margin: 0; color: #64748b; font-size: 0.95rem; }
    </style>
  </head>
  <body>
    <div class="box">
      <h2>File Not Found</h2>
      <p>This file may have already been printed or removed.</p>
    </div>
  </body>
</html>`;
    return new NextResponse(notFoundHtml, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const title = escapeHtml(`Print — ${file.filename}`);
  const fileUrl = `/api/files/${safeId}`;
  const studentInfo = file.studentName ? `Student: ${escapeHtml(file.studentName)} · ` : "";
  const isImg = file.fileType === "image";

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="icon" href="/logo.png">
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #f1f5f9;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #0f172a;
      }
      
      .topbar {
        position: sticky;
        top: 0;
        z-index: 100;
        background: #ffffff;
        border-bottom: 1px solid #e2e8f0;
        padding: 10px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      }
      .topbar-info {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .logo {
        height: 36px;
        width: 36px;
        border-radius: 50%;
        object-fit: contain;
      }
      .file-meta {
        min-width: 0;
      }
      .file-name {
        font-weight: 600;
        font-size: 14px;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .file-sub {
        font-size: 12px;
        color: #059669;
        font-weight: 500;
        margin: 0;
      }
      .topbar-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.15s ease;
        border: none;
      }
      .btn-primary {
        background: #059669;
        color: #ffffff;
      }
      .btn-primary:hover {
        background: #047857;
      }
      .btn-outline {
        background: #ffffff;
        color: #334155;
        border: 1px solid #cbd5e1;
      }
      .btn-outline:hover {
        background: #f8fafc;
      }

      .preview-container {
        padding: 24px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: calc(100vh - 65px);
      }
      .preview-card {
        background: #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        border-radius: 8px;
        overflow: hidden;
        max-width: 95vw;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 12px;
      }
      .preview-img {
        max-width: 100%;
        max-height: 85vh;
        width: auto;
        height: auto;
        display: block;
        object-fit: contain;
      }
      .pdf-frame {
        width: 90vw;
        height: 85vh;
        border: 0;
        border-radius: 6px;
      }

      #error-box {
        display: none;
        background: #fff1f2;
        border: 1px solid #fecdd3;
        color: #9f1239;
        padding: 24px 32px;
        border-radius: 8px;
        text-align: center;
        max-width: 480px;
      }

      @media print {
        @page {
          margin: 0;
          size: auto;
        }
        body {
          background: #ffffff !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .no-print {
          display: none !important;
        }
        .preview-container {
          padding: 0 !important;
          margin: 0 !important;
          display: block !important;
          min-height: auto !important;
        }
        .preview-card {
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
          max-width: 100% !important;
          display: block !important;
        }
        .preview-img {
          width: 100% !important;
          max-width: 100vw !important;
          max-height: 100vh !important;
          object-fit: contain !important;
          margin: auto !important;
          page-break-inside: avoid !important;
        }
        .pdf-frame {
          width: 100vw !important;
          height: 100vh !important;
        }
      }
    </style>
  </head>
  <body>
    <header class="no-print topbar">
      <div class="topbar-info">
        <img src="/logo.png" alt="UACC Logo" class="logo" />
        <div class="file-meta">
          <p class="file-name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</p>
          <p class="file-sub">${studentInfo}Umiya Arts &amp; Commerce College</p>
        </div>
      </div>
      <div class="topbar-actions">
        <a href="${fileUrl}?download=1" class="btn btn-outline" download="${escapeHtml(file.filename)}">
          ⬇ Download
        </a>
        <button type="button" class="btn btn-primary" onclick="triggerPrint()">
          🖨️ Print (Ctrl+P)
        </button>
      </div>
    </header>

    <main class="preview-container">
      <div id="error-box">
        <h3 style="margin-top:0;">Failed to load file preview</h3>
        <p style="font-size:14px;color:#881337;">The file may still be loading or connection was interrupted.</p>
        <button class="btn btn-primary" onclick="location.reload()" style="margin-top:8px;">🔄 Reload Page</button>
      </div>

      <div class="preview-card" id="card-wrap">
        ${
          isImg
            ? `<img id="target-img" src="${fileUrl}" alt="${escapeHtml(file.filename)}" class="preview-img" />`
            : `<iframe id="target-pdf" src="${fileUrl}" class="pdf-frame"></iframe>`
        }
      </div>
    </main>

    <script>
      let printTriggered = false;

      function triggerPrint() {
        try {
          window.print();
        } catch (e) {
          console.error("Print error:", e);
        }
      }

      ${
        isImg
          ? `
      const img = document.getElementById("target-img");
      const errBox = document.getElementById("error-box");
      const cardWrap = document.getElementById("card-wrap");

      if (img) {
        function onImageReady() {
          if (printTriggered) return;
          printTriggered = true;
          setTimeout(() => {
            triggerPrint();
          }, 350);
        }

        img.onerror = function() {
          if (errBox && cardWrap) {
            cardWrap.style.display = "none";
            errBox.style.display = "block";
          }
        };

        if (img.complete && img.naturalWidth > 0) {
          onImageReady();
        } else if (typeof img.decode === "function") {
          img.decode().then(onImageReady).catch(() => {
            img.onload = onImageReady;
          });
        } else {
          img.onload = onImageReady;
        }
      }
      `
          : `
      const frame = document.getElementById("target-pdf");
      if (frame) {
        frame.onload = function() {
          setTimeout(() => {
            try {
              frame.contentWindow ? frame.contentWindow.print() : window.print();
            } catch (e) {
              window.print();
            }
          }, 600);
        };
      }
      `
      }
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
