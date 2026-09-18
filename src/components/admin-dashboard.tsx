"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Download,
  Printer,
  Trash2,
  Eye,
  Settings as SettingsIcon,
  RefreshCw,
  Loader2,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Lock,
  Trash,
  Clock,
  X,
  Wifi,
  WifiOff,
  FolderOpen,
  Search,
  Layers,
  Users,
  DownloadCloud,
  Printer as PrinterIcon,
  ImageIcon as ImageIcon2,
  Filter,
  ChevronDown,
  Calendar,
  Hash,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAdminSocket } from "@/hooks/use-admin-socket";
import {
  createSession,
  deleteFile,
  deleteSession,
  fileUrl,
  getSettings,
  listFiles,
  listSessions,
  markPrinted,
  printAllUrl,
  printPosterUrl,
  printUrl,
  runCleanup,
  updateSession,
  updateSettings,
} from "@/lib/api";
import { formatBytes, expiryCountdown, timeAgo } from "@/lib/format";
import type { FileShape, SessionShape, SettingsShape } from "@/lib/types";

type FilterKind = "all" | "unprinted" | "image" | "pdf";
type SortKind = "newest" | "oldest" | "name";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Serialize an <svg> element to a PNG download (hi-res). */
function downloadSvgAsPng(svg: SVGSVGElement | null, filename: string) {
  if (!svg) return;
  const data = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  const size = 1024;
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/**
 * Direct print a single file using an off-screen render frame.
 * Triggers the browser's native print dialog immediately without opening a new tab or preview page.
 */
function directPrintFile(file: FileShape): Promise<void> {
  return new Promise<void>((resolve) => {
    const oldFrame = document.getElementById("direct-print-frame");
    if (oldFrame) oldFrame.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "direct-print-frame";
    // Off-screen with dimensions so Chrome/Edge fully render layout before printing
    iframe.style.position = "fixed";
    iframe.style.right = "100vw";
    iframe.style.bottom = "100vh";
    iframe.style.width = "1000px";
    iframe.style.height = "1000px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-9999";
    document.body.appendChild(iframe);

    const isImg = file.fileType === "image" || file.mimeType.startsWith("image/");
    const rawUrl = fileUrl(file.id);

    if (isImg) {
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        resolve();
        return;
      }
      doc.open();
      doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${file.filename.replace(/[<>&"]/g, "_")}</title>
  <style>
    @page { margin: 0; size: auto; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      width: 100%;
      height: 100%;
    }
    .print-page {
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      page-break-inside: avoid;
    }
    img {
      max-width: 100vw;
      max-height: 100vh;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: auto;
      display: block;
    }
  </style>
</head>
<body>
  <div class="print-page">
    <img id="print-target" src="${rawUrl}" alt="Student Document" />
  </div>
</body>
</html>`);
      doc.close();

      const img = doc.getElementById("print-target") as HTMLImageElement | null;
      const trigger = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error("Direct print failed:", e);
        }
        resolve();
      };

      if (img) {
        if (img.complete && img.naturalWidth > 0) {
          setTimeout(trigger, 150);
        } else if (typeof img.decode === "function") {
          img.decode().then(() => setTimeout(trigger, 100)).catch(() => {
            img.onload = () => setTimeout(trigger, 100);
          });
        } else {
          img.onload = () => setTimeout(trigger, 100);
        }
      } else {
        setTimeout(trigger, 300);
      }
    } else {
      // PDF handling
      iframe.src = rawUrl;
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            // Fallback for sandboxed PDF viewers
            window.open(rawUrl, "_blank");
          }
          resolve();
        }, 500);
      };
    }
  });
}

/**
 * Direct print multiple selected files in one batch without opening a new tab.
 */
function directBulkPrint(filesToPrint: FileShape[]): Promise<void> {
  return new Promise<void>((resolve) => {
    const oldFrame = document.getElementById("direct-print-frame");
    if (oldFrame) oldFrame.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "direct-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "100vw";
    iframe.style.bottom = "100vh";
    iframe.style.width = "1000px";
    iframe.style.height = "1000px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-9999";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      resolve();
      return;
    }

    const pages = filesToPrint
      .map(
        (f) => `
      <div class="print-page">
        ${
          f.fileType === "image" || f.mimeType.startsWith("image/")
            ? `<img src="${fileUrl(f.id)}" alt="Student Document" />`
            : `<iframe src="${fileUrl(f.id)}" class="pdf-inner"></iframe>`
        }
      </div>`,
      )
      .join("\n");

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Batch Print (${filesToPrint.length} files)</title>
  <style>
    @page { margin: 10mm; size: auto; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    .print-page {
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    img {
      max-width: 100%;
      max-height: 95vh;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: auto;
      display: block;
    }
    .pdf-inner {
      width: 100%;
      height: 95vh;
      border: 0;
    }
  </style>
</head>
<body>
  ${pages}
</body>
</html>`);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error("Direct bulk print failed:", e);
      }
      resolve();
    }, 700);
  });
}

/* ------------------------------------------------------------------ */
/*  QR Panel                                                          */
/* ------------------------------------------------------------------ */

function QrPanel({
  sessions,
  activeSession,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  creating,
}: {
  sessions: SessionShape[];
  activeSession: SessionShape | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onUpdate: (id: string, patch: { closed?: boolean; name?: string }) => void;
  onDelete: (id: string) => void;
  creating: boolean;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [qrZoomed, setQrZoomed] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const uploadUrl = useMemo(() => {
    if (!activeSession) return "";
    if (typeof window === "undefined") return `/?upload=${activeSession.code}`;
    return `${window.location.origin}/?upload=${activeSession.code}`;
  }, [activeSession]);

  const copy = async (text: string, kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {/* QR Zoom Modal */}
      {qrZoomed && activeSession && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setQrZoomed(false)}
        >
          <div
            className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <QRCodeSVG
              value={uploadUrl}
              size={320}
              level="H"
              marginSize={2}
              fgColor="#0f172a"
            />
            <div className="text-center">
              <p className="font-mono text-2xl font-bold tracking-widest text-slate-900">
                {activeSession.code}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Umiya Arts &amp; Commerce College · Print Desk
              </p>
            </div>
            <button
              onClick={() => setQrZoomed(false)}
              className="mt-1 rounded-lg bg-slate-100 px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

    <Card className="lg:sticky lg:top-6 flex flex-col gap-0 overflow-hidden border-emerald-100/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white">
            <QrCode className="h-3.5 w-3.5" />
          </span>
          Collection QR
        </CardTitle>
        <CardDescription>
          Show this to students. They scan &amp; upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Session selector */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Active session</Label>
          <div className="flex gap-2">
            <Select
              value={activeSession?.id ?? ""}
              onValueChange={onSelect}
              disabled={sessions.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={
                    sessions.length === 0
                      ? "No sessions yet"
                      : "Select session"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      {s.closed && (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="truncate">{s.name}</span>
                      <Badge
                        variant="secondary"
                        className="ml-1 h-4 px-1 text-[10px]"
                      >
                        {s.code}
                      </Badge>
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {s.fileCount}f
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setShowNew(true)}
              title="New session"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* QR display */}
        {activeSession ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/70 via-emerald-50/20 to-transparent p-4">
            <button
              title="Click to enlarge QR for scanning"
              onClick={() => setQrZoomed(true)}
              className="cursor-zoom-in rounded-xl p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <div
                ref={qrRef}
                className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5 transition hover:ring-2 hover:ring-emerald-400"
              >
                <QRCodeSVG
                  value={uploadUrl}
                  size={208}
                  level="M"
                  marginSize={1}
                  fgColor="#0f172a"
                />
              </div>
              <p className="mt-1 text-[10px] text-emerald-600/70">Tap to enlarge</p>
            </button>
            <div className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-black/5">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Session code
                </p>
                <p className="font-mono text-lg font-bold tracking-widest text-slate-900">
                  {activeSession.code}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copy(activeSession.code, "code")}
              >
                {copied === "code" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Quick facts */}
            <div className="grid w-full grid-cols-2 gap-2">
              <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-black/5">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Hash className="h-3 w-3" /> Files
                </p>
                <p className="text-base font-semibold text-slate-900">
                  {activeSession.fileCount}
                </p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-black/5">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Calendar className="h-3 w-3" /> Created
                </p>
                <p className="text-base font-semibold text-slate-900">
                  {new Date(activeSession.createdAt).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric" },
                  )}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => copy(uploadUrl, "link")}
              >
                {copied === "link" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy upload link
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() =>
                    downloadSvgAsPng(
                      qrRef.current?.querySelector("svg") ?? null,
                      `qr-${activeSession.code}.png`,
                    )
                  }
                >
                  <Download className="h-4 w-4" />
                  QR PNG
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() =>
                    window.open(
                      printPosterUrl(activeSession.id),
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <PrinterIcon className="h-4 w-4" />
                  Poster
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => window.open(uploadUrl, "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
                Open student page
              </Button>
            </div>

            <Separator />

            <div className="flex w-full items-center justify-between">
              <Label
                htmlFor="closed-toggle"
                className="text-sm text-muted-foreground"
              >
                {activeSession.closed ? "Closed" : "Accepting uploads"}
              </Label>
              <Switch
                id="closed-toggle"
                checked={!activeSession.closed}
                onCheckedChange={(checked) =>
                  onUpdate(activeSession.id, { closed: !checked })
                }
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Create your first session to generate a QR code.
            </p>
            <Button onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" />
              New session
            </Button>
          </div>
        )}
      </CardContent>

      {/* New session dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection session</DialogTitle>
            <DialogDescription>
              Give this session a name (e.g. “Math Homework – Grade 9”).
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder="Session name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim() && !creating) {
                  onCreate(newName.trim());
                  setNewName("");
                  setShowNew(false);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newName.trim() || creating}
              onClick={() => {
                onCreate(newName.trim());
                setNewName("");
                setShowNew(false);
              }}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  File card                                                         */
/* ------------------------------------------------------------------ */

function FileCard({
  file,
  index,
  selected,
  selectMode,
  onView,
  onPrint,
  onDelete,
  onToggleSelect,
  printing,
}: {
  file: FileShape;
  index: number;
  selected: boolean;
  selectMode: boolean;
  onView: () => void;
  onPrint: () => void;
  onDelete: () => void;
  onToggleSelect: () => void;
  printing: boolean;
}) {
  const expiry = expiryCountdown(file.expiresAt);
  const isImg = file.fileType === "image" || file.mimeType.startsWith("image/");
  const studentNameClean = file.studentName?.trim() || "Anonymous";
  const studentInitial = studentNameClean[0]?.toUpperCase() || "A";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.25) }}
    >
      <Card
        className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
          selected
            ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-500/10"
            : "border-border/60 hover:border-emerald-500/40 shadow-sm"
        }`}
      >
        {/* Thumbnail & Preview container */}
        <div className="relative h-44 w-full overflow-hidden bg-slate-100 dark:bg-slate-900/60">
          {/* Selection checkbox */}
          <div
            className={`absolute left-2.5 top-2.5 z-20 transition-all duration-200 ${
              selectMode || selected
                ? "opacity-100 scale-100"
                : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
            }`}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/95 shadow-md backdrop-blur-md ring-1 ring-black/10 dark:bg-slate-900/90 dark:ring-white/10">
              <Checkbox
                checked={selected}
                onCheckedChange={onToggleSelect}
                aria-label={`Select ${file.filename}`}
              />
            </div>
          </div>

          {/* Printed Status Pill - Top Right */}
          <div className="absolute right-2.5 top-2.5 z-20">
            {file.printed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-md backdrop-blur-md ring-1 ring-emerald-400/30">
                <CheckCircle2 className="h-3 w-3" />
                Printed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-100 shadow-md backdrop-blur-md ring-1 ring-white/15 dark:bg-slate-800/90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                New
              </span>
            )}
          </div>

          {/* File Format Badge - Bottom Left overlay */}
          <div className="absolute bottom-2.5 left-2.5 z-20">
            <span className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white shadow-sm backdrop-blur-md">
              {isImg ? (
                <>
                  <ImageIcon className="h-2.5 w-2.5 text-emerald-400" />
                  {file.mimeType.split("/")[1]?.toUpperCase() || "IMAGE"}
                </>
              ) : (
                <>
                  <FileText className="h-2.5 w-2.5 text-rose-400" />
                  PDF · {file.pageCount ?? 1}p
                </>
              )}
            </span>
          </div>

          {/* Interactive Clickable Area to View */}
          <button
            onClick={selectMode ? onToggleSelect : onView}
            className="group/btn relative h-full w-full cursor-pointer text-left focus:outline-none"
            title="Click to view file"
          >
            {isImg ? (
              <img
                src={fileUrl(file.id)}
                alt={file.filename}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-500/5 via-slate-100 to-slate-200/80 p-4 transition-colors dark:from-rose-500/10 dark:via-slate-900 dark:to-slate-800">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-rose-500/20 transition-transform duration-300 group-hover:scale-110 dark:bg-slate-800">
                  <FileText className="h-8 w-8 text-rose-500" strokeWidth={1.8} />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">
                  PDF Document
                </span>
              </div>
            )}

            {/* Hover overlay with eye icon */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900 shadow-lg dark:bg-slate-900/90 dark:text-white">
                <Eye className="h-3.5 w-3.5 text-emerald-600" />
                Quick View
              </span>
            </div>
          </button>
        </div>

        {/* Card Body */}
        <CardContent className="flex flex-1 flex-col justify-between p-3.5 gap-2.5">
          {/* Student Info & File Name */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-[11px] font-bold text-white shadow-sm">
                {studentInitial}
              </div>
              <p
                className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100"
                title={studentNameClean}
              >
                {studentNameClean}
              </p>
            </div>

            <p
              className="mt-1 truncate text-xs text-muted-foreground pl-8 font-normal"
              title={file.filename}
            >
              {file.filename}
            </p>
          </div>

          {/* Meta & Expiry Chips Row */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-border/50 pt-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {formatBytes(file.size)}
              </span>
              <span>•</span>
              <span>{timeAgo(file.createdAt)}</span>
            </div>

            {/* Clean Expiry Pill */}
            {expiry && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  expiry === "expired"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                    : "bg-amber-100/80 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                }`}
                title={`Expires at ${file.expiresAt ? new Date(file.expiresAt).toLocaleTimeString() : ""}`}
              >
                <Clock className="h-2.5 w-2.5" />
                {expiry}
              </span>
            )}
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {/* Hero Print Button */}
            <Button
              size="sm"
              onClick={onPrint}
              disabled={printing}
              className={`h-8 flex-1 gap-1.5 text-xs font-semibold shadow-sm transition-all ${
                file.printed
                  ? "bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
                  : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/25"
              }`}
              title="Print document"
            >
              {printing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              {file.printed ? "Reprint" : "Print"}
            </Button>

            {/* Secondary Action: Download */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              asChild
            >
              <a href={fileUrl(file.id, true)} download title="Download file">
                <Download className="h-3.5 w-3.5" />
              </a>
            </Button>

            {/* Secondary Action: Delete */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
              onClick={onDelete}
              title="Delete file"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  View file dialog                                                  */
/* ------------------------------------------------------------------ */

function ViewFileDialog({
  file,
  onClose,
}: {
  file: FileShape | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">
            {file?.filename}
          </DialogTitle>
          <DialogDescription>
            {file?.studentName || "Anonymous"} ·{" "}
            {file ? formatBytes(file.size) : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto rounded-lg border bg-muted/30">
          {file?.fileType === "image" ? (
             
            <img src={fileUrl(file.id)} alt={file.filename} className="mx-auto" />
          ) : file ? (
            <iframe
              src={fileUrl(file.id)}
              title={file.filename}
              className="h-[70vh] w-full"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings dialog                                                   */
/* ------------------------------------------------------------------ */

function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settings: SettingsShape;
  onSave: (s: Partial<SettingsShape>) => Promise<void>;
}) {
  const [autoDelete, setAutoDelete] = useState(settings.autoDeleteAfterPrint);
  const [retention, setRetention] = useState(settings.retentionHours);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAutoDelete(settings.autoDeleteAfterPrint);
    setRetention(settings.retentionHours);
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        autoDeleteAfterPrint: autoDelete,
        retentionHours: Number(retention),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            Auto-delete settings
          </DialogTitle>
          <DialogDescription>
            Control how long uploaded files live before being removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">
                Delete after printing
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                When you mark a file as printed, it is deleted automatically.
              </p>
            </div>
            <Switch checked={autoDelete} onCheckedChange={setAutoDelete} />
          </div>
          <div className="rounded-lg border p-3">
            <Label className="text-sm font-medium">Auto-expire uploads</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Files are deleted this long after upload. Set to 0 to disable.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={168}
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Admin Dashboard                                                   */
/* ------------------------------------------------------------------ */

export function AdminDashboard() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionShape[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileShape[]>([]);
  const [settings, setSettings] = useState<SettingsShape>({
    autoDeleteAfterPrint: false,
    retentionHours: 1,
  });
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [creating, setCreating] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewFile, setViewFile] = useState<FileShape | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<FileShape | null>(
    null,
  );
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [connected, setConnected] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  // New: search / filter / sort / bulk select
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [sort, setSort] = useState<SortKind>("newest");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions();
      setSessions(list);
      setActiveId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        const open = list.find((s) => !s.closed);
        return (open ?? list[0])?.id ?? null;
      });
    } catch (e) {
      toast({
        title: "Could not load sessions",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  }, [toast]);

  const refreshFiles = useCallback(async () => {
    if (!activeId) {
      setFiles([]);
      return;
    }
    try {
      const f = await listFiles(activeId);
      setFiles(f);
    } catch {
      /* ignore transient */
    } finally {
      setLoadingFiles(false);
    }
  }, [activeId]);

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await getSettings());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshSessions();
    refreshSettings();
  }, [refreshSessions, refreshSettings]);

  useEffect(() => {
    setLoadingFiles(true);
    setSelected(new Set());
    setSelectMode(false);
    refreshFiles();
    if (!activeId) return;

    // Fast 1.5s polling while page is visible
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshFiles();
      }
    }, 1500);

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        refreshFiles();
      }
    };

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [activeId, refreshFiles]);

  useAdminSocket(
    {
      "file-uploaded": (data) => {
        setFiles((prev) => {
          if (prev.some((f) => f.id === data.file.id)) return prev;
          return [data.file, ...prev];
        });
        setSessions((prev) =>
          prev.map((s) =>
            s.id === data.file.sessionId
              ? { ...s, fileCount: s.fileCount + 1 }
              : s,
          ),
        );
      },
      "file-deleted": (data) => {
        setFiles((prev) => prev.filter((f) => f.id !== data.fileId));
        setSelected((prev) => {
          if (!prev.has(data.fileId)) return prev;
          const next = new Set(prev);
          next.delete(data.fileId);
          return next;
        });
      },
      "file-printed": (data) => {
        setFiles((prev) =>
          prev.map((f) => (f.id === data.file.id ? data.file : f)),
        );
      },
      "session-updated": (data) => {
        setSessions((prev) =>
          prev.map((s) => (s.id === data.session.id ? data.session : s)),
        );
      },
    },
    setConnected,
  );

  /* ---- Actions ---- */

  const handleCreate = async (name: string) => {
    setCreating(true);
    try {
      const s = await createSession(name);
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.id);
      toast({ title: "Session created", description: s.name });
    } catch (e) {
      toast({
        title: "Failed to create session",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateSession = async (
    id: string,
    patch: { closed?: boolean; name?: string },
  ) => {
    try {
      const updated = await updateSession(id, patch);
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e) {
      toast({
        title: "Failed to update session",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setFiles([]);
      setActiveId(null);
      toast({ title: "Session deleted" });
    } catch (e) {
      toast({
        title: "Failed to delete session",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handlePrint = async (file: FileShape) => {
    setPrintingId(file.id);
    try {
      await directPrintFile(file);

      const updated = await markPrinted(file.id, true);
      if (updated) {
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? updated : f)),
        );
      } else {
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        toast({ title: "Printed & auto-deleted", description: file.filename });
      }
    } catch {
      /* ignore */
    } finally {
      setPrintingId(null);
    }
  };

  const handleDeleteFile = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteFile(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSessions((prev) =>
        prev.map((s) => {
          const f = files.find((x) => x.id === id);
          return f && s.id === f.sessionId
            ? { ...s, fileCount: Math.max(0, s.fileCount - 1) }
            : s;
        }),
      );
      toast({ title: "File deleted" });
    } catch (e) {
      toast({
        title: "Failed to delete file",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    setConfirmClearAll(false);
    const targets = [...files];
    for (const f of targets) {
      try {
        await deleteFile(f.id);
      } catch {
        /* ignore */
      }
    }
    setFiles([]);
    setSelected(new Set());
    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, fileCount: 0 } : s)),
    );
    toast({ title: `Deleted ${targets.length} file(s)` });
  };

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false);
    setBulkWorking(true);
    const ids = Array.from(selected);
    let n = 0;
    for (const id of ids) {
      try {
        await deleteFile(id);
        n++;
      } catch {
        /* ignore */
      }
    }
    setFiles((prev) => prev.filter((f) => !selected.has(f.id)));
    setSelected(new Set());
    setSelectMode(false);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeId
          ? { ...s, fileCount: Math.max(0, s.fileCount - n) }
          : s,
      ),
    );
    setBulkWorking(false);
    toast({ title: `Deleted ${n} file(s)` });
  };

  const handleBulkPrint = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const selectedFiles = files.filter((f) => selected.has(f.id));
    await directBulkPrint(selectedFiles);

    // Mark them printed (best-effort, sequential).
    (async () => {
      for (const id of ids) {
        try {
          await markPrinted(id, true);
        } catch {
          /* ignore */
        }
      }
      // Refresh so badges update / auto-deleted ones drop.
      refreshFiles();
    })();
  };

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const n = await runCleanup();
      await refreshFiles();
      toast({
        title: `Cleanup done`,
        description: `${n} expired file(s) removed`,
      });
    } catch (e) {
      toast({
        title: "Cleanup failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCleaning(false);
    }
  };

  const handleSaveSettings = async (patch: Partial<SettingsShape>) => {
    try {
      const s = await updateSettings(patch);
      setSettings(s);
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({
        title: "Failed to save settings",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  /* ---- Derived: filtered + sorted files ---- */

  const visibleFiles = useMemo(() => {
    let list = files;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          (f.studentName || "").toLowerCase().includes(q) ||
          f.filename.toLowerCase().includes(q),
      );
    }
    if (filter === "unprinted") list = list.filter((f) => !f.printed);
    else if (filter === "image") list = list.filter((f) => f.fileType === "image");
    else if (filter === "pdf") list = list.filter((f) => f.fileType === "pdf");

    const sorted = [...list];
    if (sort === "newest")
      sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    else if (sort === "oldest")
      sorted.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    else if (sort === "name")
      sorted.sort((a, b) =>
        (a.studentName || "z").localeCompare(b.studentName || "z"),
      );
    return sorted;
  }, [files, search, filter, sort]);

  const totalSize = useMemo(
    () => files.reduce((acc, f) => acc + f.size, 0),
    [files],
  );
  const printedCount = files.filter((f) => f.printed).length;
  const uniqueStudents = useMemo(() => {
    const names = new Set(
      files
        .filter((f) => f.studentName && f.studentName.trim())
        .map((f) => f.studentName!.toLowerCase()),
    );
    const anonCount = files.filter((f) => !f.studentName || !f.studentName.trim())
      .length;
    return names.size + (anonCount > 0 ? 1 : 0);
  }, [files]);

  const allVisibleSelected =
    visibleFiles.length > 0 &&
    visibleFiles.every((f) => selected.has(f.id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleFiles.forEach((f) => next.delete(f.id));
        return next;
      }
      const next = new Set(prev);
      visibleFiles.forEach((f) => next.add(f.id));
      return next;
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-muted/40 via-muted/20 to-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Umiya College Logo"
              className="h-10 w-10 object-contain drop-shadow-sm rounded-full bg-white p-0.5"
            />
            <div className="leading-tight">
              <h1 className="text-base font-bold tracking-tight text-foreground">
                Umiya Arts &amp; Commerce College
              </h1>
              <p className="text-[11px] font-medium text-emerald-600">
                Shree Umiya K.V.C. Education Trust · Print Desk
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={`hidden sm:flex items-center gap-1.5 ${
                connected
                  ? "border-emerald-300 bg-emerald-50/60 text-emerald-700"
                  : "text-muted-foreground"
              }`}
            >
              {connected ? (
                <>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </span>
                  Live
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Polling
                </>
              )}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCleanup}
              disabled={cleaning}
              title="Cleanup expired files"
            >
              {cleaning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <QrPanel
            sessions={sessions}
            activeSession={activeSession}
            onSelect={setActiveId}
            onCreate={handleCreate}
            onUpdate={handleUpdateSession}
            onDelete={handleDeleteSession}
            creating={creating}
          />

          {/* Files */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  Received files
                  {activeSession && (
                    <Badge variant="secondary">{files.length}</Badge>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {activeSession
                    ? activeSession.closed
                      ? "Session closed — students can no longer upload."
                      : "Updates live as students upload."
                    : "Select a session to view files."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={selectMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectMode((v) => !v);
                    if (selectMode) setSelected(new Set());
                  }}
                  disabled={files.length === 0}
                  className={selectMode ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}
                >
                  <Layers className="mr-2 h-3.5 w-3.5" />
                  {selectMode ? "Done" : "Select"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshFiles}
                  disabled={!activeId || loadingFiles}
                >
                  {loadingFiles ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>

            {/* Bulk action bar */}
            <AnimatePresence>
              {selectMode && files.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2">
                    <label className="flex items-center gap-2 px-2 text-sm">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                      />
                      <span className="font-medium">
                        {selected.size} selected
                      </span>
                    </label>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleBulkPrint}
                        disabled={selected.size === 0 || bulkWorking}
                      >
                        <PrinterIcon className="mr-1.5 h-3.5 w-3.5" />
                        Print all
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmBulkDelete(true)}
                        disabled={selected.size === 0 || bulkWorking}
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      >
                        {bulkWorking ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Search + filter + sort */}
            {files.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by student or file name…"
                    className="h-9 pl-8"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center overflow-hidden rounded-md border">
                  {(
                    [
                      ["all", "All"],
                      ["unprinted", "Unprinted"],
                      ["image", "Images"],
                      ["pdf", "PDFs"],
                    ] as [FilterKind, string][]
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setFilter(k)}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        filter === k
                          ? "bg-emerald-600 text-white"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Select value={sort} onValueChange={(v) => setSort(v as SortKind)}>
                  <SelectTrigger className="h-9 w-[130px]">
                    <Filter className="mr-1.5 h-3 w-3" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="name">Student A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {!activeId ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No session selected.
                </p>
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{
                    repeat: Infinity,
                    duration: 3,
                    ease: "easeInOut",
                  }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
                >
                  <QrCode className="h-8 w-8" />
                </motion.div>
                <div>
                  <p className="text-sm font-medium">Waiting for uploads</p>
                  <p className="text-xs text-muted-foreground">
                    Students scan the QR — files appear here instantly.
                  </p>
                </div>
              </div>
            ) : visibleFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
                <Search className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No files match your filters.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <ScrollArea className="max-h-[calc(100vh-18rem)]">
                <motion.div
                  layout
                  className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 xl:grid-cols-4"
                >
                  <AnimatePresence mode="popLayout">
                    {visibleFiles.map((f, i) => (
                      <FileCard
                        key={f.id}
                        file={f}
                        index={i}
                        selected={selected.has(f.id)}
                        selectMode={selectMode}
                        onView={() => setViewFile(f)}
                        onPrint={() => handlePrint(f)}
                        onDelete={() => setConfirmDeleteFile(f)}
                        onToggleSelect={() => toggleSelect(f.id)}
                        printing={printingId === f.id}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </ScrollArea>
            )}


          </div>
        </div>
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3 w-3" />
              <b className="text-foreground">{files.length}</b> files
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              <b className="text-foreground">{uniqueStudents}</b> students
            </span>
            <span className="flex items-center gap-1.5">
              <DownloadCloud className="h-3 w-3" />
              <b className="text-foreground">{formatBytes(totalSize)}</b> total
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <b className="text-emerald-600">{printedCount}</b> printed
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Clock className="h-3 w-3" />
              {settings.autoDeleteAfterPrint
                ? "Auto-delete after print: on"
                : `Auto-expire: ${
                    settings.retentionHours > 0
                      ? settings.retentionHours + "h"
                      : "off"
                  }`}
            </span>
          </div>
          <span className="text-muted-foreground/70">
            QR File Collector · files stored locally &amp; auto-cleaned
          </span>
        </div>
      </footer>

      <ViewFileDialog file={viewFile} onClose={() => setViewFile(null)} />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <AlertDialog
        open={confirmDeleteFile !== null}
        onOpenChange={(o) => !o && setConfirmDeleteFile(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{confirmDeleteFile?.filename}</b> by{" "}
              {confirmDeleteFile?.studentName || "Anonymous"} will be permanently
              removed from disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingId !== null}
              onClick={() => {
                if (confirmDeleteFile) handleDeleteFile(confirmDeleteFile.id);
                setConfirmDeleteFile(null);
              }}
            >
              {deletingId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClearAll} onOpenChange={setConfirmClearAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all files in this session?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {files.length} file(s) from disk. The session stays
              open for new uploads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClearAll}
            >
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size} selected file(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These files will be permanently removed from disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkWorking}
              onClick={handleBulkDelete}
            >
              {bulkWorking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete {selected.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
