"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Camera,
  FileText,
  Image as ImageIcon,
  X,
  CheckCircle2,
  Loader2,
  ArrowUpFromLine,
  AlertCircle,
  User,
  Lock,
  ScanLine,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { getSessionByCode, uploadFile } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { SessionShape } from "@/lib/types";

interface PendingFile {
  id: string;
  file: File;
  previewUrl?: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

const ACCEPT = "*/*"; // allow any file type
const MAX_SIZE = 15 * 1024 * 1024; // 15MB — matches backend

export function StudentUploadView({ code }: { code: string }) {
  const { toast } = useToast();
  const [session, setSession] = useState<SessionShape | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">(
    "loading",
  );
  const [studentName, setStudentName] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const lastBeepedIds = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initAudio = () => {
    try {
      if (!audioCtxRef.current && typeof window !== "undefined") {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch {
      // Audio context not allowed or not supported
    }
  };

  const playBeep = () => {
    try {
      initAudio();
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(600, ctx.currentTime);

      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // Audio policy
    }
  };

  // Play beep when a file finishes uploading
  useEffect(() => {
    pending.forEach((p) => {
      if (p.status === "done" && !lastBeepedIds.current.has(p.id)) {
        playBeep();
        lastBeepedIds.current.add(p.id);
      }
    });
  }, [pending]);

  // Remember the student's name across uploads on the same device.
  useEffect(() => {
    const saved = localStorage.getItem("qrfc:studentName");
    if (saved) setStudentName(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("qrfc:studentName", studentName);
  }, [studentName]);

  // Load session by code.
  const loadSession = useCallback(async () => {
    setLoadState("loading");
    try {
      const s = await getSessionByCode(code);
      setSession(s);
      setLoadState("ok");
    } catch {
      setLoadState("error");
    }
  }, [code]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const arr = Array.from(fileList);
      const accepted: PendingFile[] = [];
      for (const f of arr) {
        const isImage = f.type.startsWith("image/");
        // No MIME type restriction; all files are accepted.
        if (f.size > MAX_SIZE) {
          toast({
            title: "File too large",
            description: `${f.name} is ${formatBytes(f.size)} (max 15MB).`,
            variant: "destructive",
          });
          continue;
        }
        const previewUrl = isImage ? URL.createObjectURL(f) : undefined;
        accepted.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          previewUrl,
          status: "pending",
          progress: 0,
        });
      }
      if (accepted.length > 0) {
        setAllDone(false);
        setPending((prev) => [...prev, ...accepted]);
      }
    },
    [toast],
  );

  const removePending = (id: string) => {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const uploadOne = useCallback(
    async (pf: PendingFile) => {
      setPending((prev) =>
        prev.map((p) =>
          p.id === pf.id ? { ...p, status: "uploading", progress: 0 } : p,
        ),
      );
      try {
        const result = await uploadFile(code, pf.file, studentName, (pct) => {
          setPending((prev) =>
            prev.map((p) =>
              p.id === pf.id ? { ...p, progress: pct } : p,
            ),
          );
        });
        setPending((prev) =>
          prev.map((p) =>
            p.id === pf.id
              ? { ...p, status: "done", progress: 100 }
              : p,
          ),
        );
        return result;
      } catch (e) {
        setPending((prev) =>
          prev.map((p) =>
            p.id === pf.id
              ? { ...p, status: "error", error: (e as Error).message }
              : p,
          ),
        );
        return null;
      }
    },
    [code, studentName],
  );

  const uploadAll = async () => {
    initAudio();
    const toUpload = pending.filter((p) => p.status === "pending");
    if (toUpload.length === 0) return;

    // Upload with concurrency of up to 3 parallel streams for faster mobile uploads
    const CONCURRENCY = 3;
    const queue = [...toUpload];
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            await uploadOne(item);
          }
        }
      },
    );

    await Promise.all(workers);

    setAllDone(true);
    toast({
      title: "Upload complete",
      description: `${toUpload.length} file(s) sent to the admin.`,
    });
  };

  const retry = (pf: PendingFile) => {
    setPending((prev) =>
      prev.map((p) =>
        p.id === pf.id ? { ...p, status: "pending", progress: 0, error: undefined } : p,
      ),
    );
  };

  const resetAfterDone = () => {
    pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setPending([]);
    setAllDone(false);
  };

  /* ---- Render states ---- */

  if (loadState === "loading") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      </Shell>
    );
  }

  if (loadState === "error") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div>
            <p className="text-base font-semibold">Session not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This QR code is invalid or the session was deleted.
            </p>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Code: {code}
          </p>
        </div>
      </Shell>
    );
  }

  const closed = session?.closed === true;

  return (
    <Shell sessionName={session?.name}>
      {/* Drop zone / picker */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (closed) return;
          addFiles(e.dataTransfer.files);
        }}
        className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging
            ? "border-emerald-400 bg-emerald-50/50"
            : "border-border bg-muted/20"
        } ${closed ? "opacity-60" : ""}`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <ScanLine className="h-8 w-8" />
        </div>
        <div>
          <p className="text-base font-semibold">Add your file(s)</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Images or PDF · up to 15 MB each
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={() => {
              initAudio();
              cameraInputRef.current?.click();
            }}
            disabled={closed}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Camera className="mr-2 h-4 w-4" />
            Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              initAudio();
              fileInputRef.current?.click();
            }}
            disabled={closed}
          >
            <ArrowUpFromLine className="mr-2 h-4 w-4" />
            Choose files
          </Button>
        </div>

        {closed && (
          <div className="mt-2 flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            <Lock className="h-3 w-3" />
            This session is closed for uploads
          </div>
        )}
      </div>

      {/* Student name */}
      <div className="mt-4">
        <Label
          htmlFor="student-name"
          className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <User className="h-3 w-3" />
          Your name (optional)
        </Label>
        <Input
          id="student-name"
          placeholder="e.g. Rahul S."
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          disabled={closed}
          className="bg-background"
        />
      </div>

      {/* Pending files */}
      {pending.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              {pending.length} file(s) queued
            </Label>
            {!allDone && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetAfterDone}
                className="h-7 text-xs text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>
          {pending.map((pf) => (
            <PendingRow
              key={pf.id}
              pf={pf}
              onRemove={() => removePending(pf.id)}
              onRetry={() => retry(pf)}
            />
          ))}
        </div>
      )}

      {/* Upload action */}
      {pending.length > 0 && !allDone && !closed && (
        <div className="sticky bottom-16 z-10 mt-5">
          <Button
            size="lg"
            className="w-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
            onClick={uploadAll}
            disabled={pending.every(
              (p) => p.status === "uploading" || p.status === "done",
            )}
          >
            {pending.some((p) => p.status === "uploading") ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Send {pending.filter((p) => p.status === "pending").length} file(s)
          </Button>
        </div>
      )}

      {/* Success state */}
      {allDone && pending.length > 0 && pending.every((p) => p.status === "done") && (
        <Card className="mt-5 border-emerald-200 bg-emerald-50/60">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <p className="text-base font-semibold text-emerald-900">
                All done!
              </p>
              <p className="mt-0.5 text-sm text-emerald-700">
                Your {pending.length} file(s) were received by the admin.
              </p>
            </div>
            <Button onClick={resetAfterDone} variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Upload more
            </Button>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/*  Pending row                                                       */
/* ------------------------------------------------------------------ */

function PendingRow({
  pf,
  onRemove,
  onRetry,
}: {
  pf: PendingFile;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const isImage = pf.file.type.startsWith("image/");
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {pf.previewUrl ? (
            <img
              src={pf.previewUrl}
              alt={pf.file.name}
              className="h-full w-full object-cover"
            />
          ) : isImage ? (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          ) : (
            <FileText className="h-5 w-5 text-rose-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={pf.file.name}>
            {pf.file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(pf.file.size)}
          </p>
          {pf.status === "uploading" && (
            <Progress value={pf.progress} className="mt-1.5 h-1.5" />
          )}
          {pf.status === "done" && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Received
            </p>
          )}
          {pf.status === "error" && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3 w-3" /> {pf.error || "Failed"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          {pf.status === "error" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRetry}
              className="text-xs"
            >
              Retry
            </Button>
          )}
          {pf.status === "pending" && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onRemove}
              className="h-8 w-8 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          {pf.status === "done" && (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          )}
          {pf.status === "uploading" && (
            <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Shell                                                             */
/* ------------------------------------------------------------------ */

function Shell({
  children,
  sessionName,
}: {
  children: React.ReactNode;
  sessionName?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white/60 dark:bg-slate-950/70 backdrop-blur-[2px]">
      <header className="border-b bg-white/85 dark:bg-slate-900/85 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <img
            src="/logo.png"
            alt="Umiya College Logo"
            className="h-11 w-11 object-contain drop-shadow-sm rounded-full bg-white p-0.5"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-sm font-bold text-foreground">
              Umiya Arts &amp; Commerce College
            </h1>
            <p className="text-[11px] font-medium text-emerald-600">
              {sessionName || "Student Print Desk"}
            </p>
          </div>
          <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50/60 font-semibold">
            Upload
          </Badge>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-5">{children}</main>
      <footer className="mt-auto border-t bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-center gap-1.5 px-4 py-3 text-[11px] text-muted-foreground">
          <ScanLine className="h-3 w-3" />
          Secure upload · files are auto-deleted after use
        </div>
      </footer>
    </div>
  );
}
