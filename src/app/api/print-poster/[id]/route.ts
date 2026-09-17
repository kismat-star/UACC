import { db } from "@/lib/db";
import QRCode from "qrcode";

/**
 * GET /api/print-poster/[id]?code=SESSIONCODE
 * Returns a print-optimized HTML page: large QR + session name + code +
 * step-by-step instructions. Meant to be printed and pinned in a classroom.
 * The session id is used to look up name/code; the upload URL is built from
 * the current host so students scan the right origin.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await db.session.findUnique({ where: { id } });

  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  const host = req.headers.get("host") || "localhost:81";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const uploadUrl = `${proto}://${host}/?upload=${session.code}`;

  // Render QR as a crisp SVG string.
  const qrSvg = await QRCode.toString(uploadUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
    width: 520,
  });

  const created = session.createdAt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scan &amp; Upload — ${escapeHtml(session.name)}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #fff;
  }
  .poster {
    max-width: 800px;
    margin: 0 auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: #ecfdf5; color: #047857;
    border: 1px solid #a7f3d0;
    padding: 6px 14px; border-radius: 999px;
    font-size: 13px; font-weight: 600; letter-spacing: .02em;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
  h1 { margin: 0; font-size: 36px; line-height: 1.15; font-weight: 800; }
  .sub { margin: 4px 0 0; color: #475569; font-size: 15px; }
  .code-row {
    display: flex; align-items: center; gap: 12px;
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 14px; padding: 12px 18px;
  }
  .code-label { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
  .code-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 28px; font-weight: 800; letter-spacing: .35em; color: #0f172a; }
  .grid { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 28px; align-items: center; }
  .qr { background: #fff; padding: 16px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px -12px rgba(2,6,23,.18); }
  .qr svg { display: block; width: 100%; height: auto; }
  .steps { display: flex; flex-direction: column; gap: 14px; }
  .step { display: flex; gap: 12px; align-items: flex-start; }
  .step .n {
    flex: none; width: 28px; height: 28px; border-radius: 50%;
    background: #10b981; color: #fff; font-weight: 700;
    display: flex; align-items: center; justify-content: center; font-size: 14px;
  }
  .step .t { font-size: 15px; line-height: 1.45; color: #1e293b; }
  .step .t b { display: block; font-size: 16px; }
  .note { font-size: 12px; color: #64748b; margin-top: 4px; }
  .foot { display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 12px; font-size: 12px; color: #64748b; }
  @media print { .no-print { display: none !important; } }
  .print-btn {
    position: fixed; right: 24px; bottom: 24px;
    background: #10b981; color: #fff; border: none; border-radius: 12px;
    padding: 12px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
    box-shadow: 0 12px 30px -8px rgba(16,185,129,.5);
  }
</style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Print this poster</button>
  <div class="poster">
    <span class="badge"><span class="dot"></span> Scan &amp; Submit</span>
    <div>
      <h1>${escapeHtml(session.name)}</h1>
      <p class="sub">Open your phone camera, scan the QR, and upload your image or PDF.</p>
    </div>
    <div class="grid">
      <div class="qr">${qrSvg}</div>
      <ol class="steps">
        <li class="step"><span class="n">1</span><span class="t"><b>Open your camera</b>Point it at the QR code.</span></li>
        <li class="step"><span class="n">2</span><span class="t"><b>Tap the link</b>that appears on your screen.</span></li>
        <li class="step"><span class="n">3</span><span class="t"><b>Add your name</b>and pick a photo or PDF (max 15 MB).</span></li>
        <li class="step"><span class="n">4</span><span class="t"><b>Press Send.</b>Your file reaches the teacher instantly.</span></li>
        <li class="step"><span class="n">5</span><span class="t"><b>Done!</b>Files are deleted automatically after use.</span></li>
      </ol>
    </div>
    <div class="code-row">
      <div>
        <div class="code-label">Session code</div>
        <div class="code-value">${session.code}</div>
      </div>
      <div class="note" style="margin-left:auto;text-align:right">
        If the QR won't scan, open this link:<br>
        <b>${escapeHtml(uploadUrl)}</b>
      </div>
    </div>
    <div class="foot">
      <span>Created ${created}</span>
      <span>QR File Collector</span>
    </div>
  </div>
  <script>setTimeout(function(){try{window.print()}catch(e){}},400);</script>
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
