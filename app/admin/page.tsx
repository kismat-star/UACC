"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";

type FileRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
};

type Submission = {
  id: string;
  token: string;
  studentName: string;
  status: string;
  rejectionReason?: string | null;
  createdAt: string;
  files: FileRecord[];
};

const STATUS_OPTIONS = ["SUBMITTED", "PROCESSING", "READY", "COMPLETED", "REJECTED"];
const STATUS_STYLE: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-800 border-amber-200",
  PROCESSING: "bg-blue-100 text-blue-800 border-blue-200",
  READY: "bg-emerald-100 text-emerald-800 border-emerald-200",
  COMPLETED: "bg-gray-100 text-gray-700 border-gray-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
};
const STATUS_EMOJI: Record<string, string> = {
  SUBMITTED: "🟡",
  PROCESSING: "🔵",
  READY: "🟢",
  COMPLETED: "✅",
  REJECTED: "🔴",
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateString: string) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// Synthesize pleasant counter chime using Web Audio API (no external file needed)
function playDing() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch {
    // browser audio policy might delay sound until user interaction
  }
}

export default function AdminDashboard() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [qrData, setQrData] = useState<{ url: string; qrDataUrl: string } | null>(null);
  const [fullscreenQr, setFullscreenQr] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newSubmissionNotice, setNewSubmissionNotice] = useState<string | null>(null);

  // Storage and retention settings
  const [retentionMinutes, setRetentionMinutes] = useState(30);
  const [diskStats, setDiskStats] = useState<{ count: number; size: number }>({ count: 0, size: 0 });
  const [cleaning, setCleaning] = useState(false);

  const prevCountRef = useRef(0);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const loadDiskStats = useCallback(async () => {
    try {
      const res = await fetch("/api/cleanup");
      if (res.ok) {
        const data = await res.json();
        setRetentionMinutes(data.retentionMinutes || 30);
        setDiskStats({ count: data.diskFilesCount || 0, size: data.diskTotalBytes || 0 });
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchSubmissions = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/submissions?${params}`);
      if (res.ok) {
        const data: Submission[] = await res.json();

        // Check if new submissions arrived
        if (prevCountRef.current > 0 && data.length > prevCountRef.current) {
          const newest = data[0];
          setNewSubmissionNotice(`New file from ${newest.studentName} (${newest.token})`);
          if (soundRef.current) playDing();
        }
        prevCountRef.current = data.length;
        setSubmissions(data);
      }
    } catch {
      // ignore fetch errors
    }
  }, [search, statusFilter]);

  // Load QR code on mount
  useEffect(() => {
    fetch("/api/qr")
      .then((r) => r.json())
      .then((d) => setQrData(d))
      .catch(() => {});
    loadDiskStats();
  }, [loadDiskStats]);

  // Fast polling (every 3.5 seconds) for real-time counter feeling
  useEffect(() => {
    fetchSubmissions();
    const interval = setInterval(fetchSubmissions, 3500);
    return () => clearInterval(interval);
  }, [fetchSubmissions]);

  const openSubmission = (s: Submission) => {
    setSelected(s);
    setNewStatus(s.status);
    setRejectionReason(s.rejectionReason ?? "");
    setPreviewFile(null);
  };

  const updateStatus = async (id: string, status: string, deleteFilesNow = false) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionReason, deleteFilesNow }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (selected?.id === id) setSelected(updated);
        setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        loadDiskStats();
      }
    } finally {
      setSaving(false);
    }
  };

  // Direct print helper
  const directPrint = (fileId: string, submissionId?: string) => {
    const printWindow = window.open(`/api/files/${fileId}`, "_blank");
    if (printWindow) {
      setTimeout(() => {
        try {
          printWindow.print();
        } catch {
          // print might require direct action
        }
      }, 1000);
    }
    // Optionally mark as processing
    if (submissionId) {
      updateStatus(submissionId, "PROCESSING");
    }
  };

  // Delete submission and all files immediately
  const deleteSubmission = async (id: string) => {
    if (!confirm("Are you sure you want to delete this submission and its files permanently?")) return;
    try {
      const res = await fetch(`/api/submissions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
        if (selected?.id === id) setSelected(null);
        loadDiskStats();
      }
    } catch {
      alert("Failed to delete submission");
    }
  };

  // Trigger manual expired files cleanup
  const handlePurge = async () => {
    setCleaning(true);
    try {
      const res = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionMinutes }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Cleanup complete: ${data.deletedFiles} files and ${data.deletedSubmissions} expired records removed.`);
        fetchSubmissions();
        loadDiskStats();
      }
    } finally {
      setCleaning(false);
    }
  };

  // Change auto-delete retention setting
  const updateRetention = async (minutes: number) => {
    setRetentionMinutes(minutes);
    try {
      await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionMinutes: minutes }),
      });
      loadDiskStats();
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        {/* Header */}
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-lg shadow-md shadow-blue-500/20">
              🖨️
            </div>
            <div>
              <p className="font-bold text-sm tracking-wide">College Print</p>
              <p className="text-slate-400 text-xs">Live Counter Desk</p>
            </div>
          </div>
        </div>

        {/* Navigation & Status Filters */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Queue Views</p>
          <button
            onClick={() => { setStatusFilter(""); setSearch(""); }}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center justify-between transition-colors ${
              statusFilter === "" ? "bg-blue-600 text-white font-medium" : "hover:bg-slate-800 text-slate-300"
            }`}
          >
            <span>🏠 All Submissions</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {submissions.length}
            </span>
          </button>

          <button
            onClick={() => { setStatusFilter("SUBMITTED"); setSearch(""); }}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center justify-between transition-colors ${
              statusFilter === "SUBMITTED" ? "bg-blue-600 text-white font-medium" : "hover:bg-slate-800 text-slate-300"
            }`}
          >
            <span>🟡 New / Pending</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
              {submissions.filter((s) => s.status === "SUBMITTED").length}
            </span>
          </button>

          <button
            onClick={() => { setStatusFilter("COMPLETED"); setSearch(""); }}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center justify-between transition-colors ${
              statusFilter === "COMPLETED" ? "bg-blue-600 text-white font-medium" : "hover:bg-slate-800 text-slate-300"
            }`}
          >
            <span>✅ Printed / Done</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
              {submissions.filter((s) => s.status === "COMPLETED").length}
            </span>
          </button>

          <hr className="border-slate-800 my-3" />

          {/* Ephemeral Storage / Auto-delete Settings */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <span>⏱️</span> Auto-Delete Files
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">Active</span>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Delete files after:</label>
              <select
                value={retentionMinutes}
                onChange={(e) => updateRetention(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes (Recommended)</option>
                <option value={60}>1 Hour</option>
                <option value={120}>2 Hours</option>
              </select>
            </div>

            <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-700/50 flex justify-between items-center">
              <span>Disk Storage:</span>
              <span className="font-mono text-slate-300">
                {diskStats.count} files ({formatSize(diskStats.size)})
              </span>
            </div>

            <button
              onClick={handlePurge}
              disabled={cleaning}
              className="w-full bg-slate-700/80 hover:bg-rose-900/60 hover:text-rose-200 text-slate-300 text-xs py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {cleaning ? "Cleaning..." : "🧹 Purge Expired Files Now"}
            </button>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center justify-between"
            >
              <span>🔔 Audio Chime</span>
              <span className={soundEnabled ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                {soundEnabled ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        </nav>

        {/* User Signout */}
        <div className="p-3 border-t border-slate-800">
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-slate-400 hover:text-rose-300 flex items-center gap-2 transition-colors"
          >
            <span>🚪</span> Sign Out Admin
          </button>
        </div>
      </aside>

      {/* Main Counter Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4 shadow-sm z-10">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-sm">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search token, student name..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_EMOJI[s]} {s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            {/* Live New Upload Banner */}
            {newSubmissionNotice && (
              <div className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 animate-bounce shadow-md">
                <span>🔔 {newSubmissionNotice}</span>
                <button onClick={() => setNewSubmissionNotice(null)} className="opacity-80 hover:opacity-100 ml-1">✕</button>
              </div>
            )}

            <button
              onClick={() => setFullscreenQr(true)}
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium px-3.5 py-2 rounded-xl border border-indigo-200 flex items-center gap-1.5 transition-colors"
              title="Open full-screen QR code for student counter display"
            >
              <span>📱</span> Student QR Display
            </button>

            <button
              onClick={fetchSubmissions}
              className="text-slate-500 hover:text-blue-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
              title="Refresh submissions"
            >
              🔄
            </button>
          </div>
        </header>

        {/* Counter Workspace: Split View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Instant QR Display Card (Always ready for student to scan) */}
          <div className="w-80 bg-white border-r border-slate-200 flex flex-col p-5 overflow-y-auto shrink-0 shadow-sm">
            <div className="text-center">
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium mb-2 border border-blue-100">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Counter Scanner
              </span>
              <h2 className="text-base font-bold text-slate-800">Scan to Submit Document</h2>
              <p className="text-slate-500 text-xs mt-0.5">Show this to student at the desk</p>
            </div>

            {/* QR Code Container */}
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center shadow-inner flex flex-col items-center justify-center">
              {qrData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrData.qrDataUrl}
                  alt="Student Upload QR"
                  className="w-52 h-52 object-contain bg-white p-2 rounded-xl shadow-sm border border-slate-200"
                />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-400">
                  Generating QR...
                </div>
              )}
              <p className="text-[11px] font-mono text-slate-400 mt-2 truncate max-w-full">
                {qrData?.url}
              </p>
            </div>

            {/* Quick QR Actions */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={() => setFullscreenQr(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded-xl font-medium transition-colors text-center"
              >
                🖥️ Full Screen
              </button>
              <button
                onClick={() => {
                  if (!qrData) return;
                  const a = document.createElement("a");
                  a.href = qrData.qrDataUrl;
                  a.download = "college-print-qr.png";
                  a.click();
                }}
                className="border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs py-2 rounded-xl font-medium transition-colors text-center"
              >
                ⬇️ Download
              </button>
            </div>

            {/* Counter Workflow Explainer */}
            <div className="mt-5 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-500">
              <p className="font-semibold text-slate-700 text-xs">How this works:</p>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600">1.</span>
                <span>Student scans this QR with their phone.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600">2.</span>
                <span>Uploads photo or PDF in 30 seconds.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600">3.</span>
                <span>File appears instantly on right → Click <b>Direct Print</b>!</span>
              </div>
            </div>

            {/* Auto Delete badge */}
            <div className="mt-auto pt-4 border-t border-slate-100 text-center">
              <div className="bg-emerald-50 text-emerald-800 text-[11px] p-2 rounded-xl border border-emerald-100 flex items-center justify-center gap-1.5">
                <span>⏱️</span>
                <span>Files auto-delete in {retentionMinutes} mins</span>
              </div>
            </div>
          </div>

          {/* Center Column: Live Submissions Stream */}
          <div className={`flex-1 overflow-y-auto p-6 ${selected ? "w-1/2" : "w-full"}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span>Live Print Queue</span>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-mono">
                    {submissions.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Auto-refreshes every 3 seconds</p>
              </div>

              {submissions.length > 0 && (
                <div className="text-xs text-slate-500">
                  Showing newest submissions first
                </div>
              )}
            </div>

            {/* Submissions List */}
            <div className="space-y-3">
              {submissions.map((s) => (
                <div
                  key={s.id}
                  className={`bg-white rounded-2xl border p-4 transition-all shadow-sm ${
                    selected?.id === s.id
                      ? "border-blue-500 ring-2 ring-blue-100"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                          {s.token}
                        </span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${STATUS_STYLE[s.status]}`}>
                          {STATUS_EMOJI[s.status]} {s.status}
                        </span>
                        <span className="text-xs text-slate-400 font-medium ml-auto">
                          🕒 {timeAgo(s.createdAt)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-baseline gap-2">
                        <h3 className="font-semibold text-slate-900 text-base">{s.studentName}</h3>
                        <span className="text-xs text-slate-400">
                          ({s.files.length} file{s.files.length !== 1 ? "s" : ""})
                        </span>
                      </div>

                      {/* Files Quick Actions Strip */}
                      <div className="mt-3 space-y-2">
                        {s.files.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-base shrink-0">
                                {file.mimeType.includes("pdf") ? "📄" : "🖼️"}
                              </span>
                              <span className="truncate font-medium text-slate-700">{file.originalName}</span>
                              <span className="text-slate-400 shrink-0">({formatSize(file.fileSize)})</span>
                            </div>

                            {/* 1-Click Action Buttons right on card */}
                            <div className="flex items-center gap-1.5 ml-2 shrink-0">
                              <button
                                onClick={() => directPrint(file.id, s.id)}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 shadow-sm transition-colors"
                                title="Open print dialog immediately"
                              >
                                <span>🖨️</span> Print Direct
                              </button>
                              <Link
                                href={`/api/files/${file.id}`}
                                target="_blank"
                                download={file.originalName}
                                className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 px-2 py-1 rounded-lg text-xs transition-colors"
                                title="Download file"
                              >
                                ⬇️
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Quick Toolbar */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      {s.status !== "COMPLETED" && (
                        <button
                          onClick={() => updateStatus(s.id, "COMPLETED", false)}
                          className="text-emerald-700 hover:bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-medium transition-colors"
                        >
                          ✅ Mark Done
                        </button>
                      )}
                      <button
                        onClick={() => openSubmission(s)}
                        className="text-slate-600 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors"
                      >
                        👁️ Full Details & Preview
                      </button>
                    </div>

                    <button
                      onClick={() => deleteSubmission(s.id)}
                      className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                      title="Permanently delete submission and delete file from disk now"
                    >
                      <span>🗑️</span> Delete File Now
                    </button>
                  </div>
                </div>
              ))}

              {submissions.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
                  <div className="text-5xl mb-3">📭</div>
                  <h3 className="font-semibold text-slate-700 text-base">Print queue is currently empty</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Students will show up here the instant they scan the counter QR code and submit a photo or PDF!
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Slide-in File Detail & Preview Inspector */}
          {selected && (
            <div className="w-96 border-l border-slate-200 bg-white overflow-y-auto flex flex-col shrink-0 shadow-lg">
              {/* Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div>
                  <span className="font-mono font-bold text-blue-600 text-sm">{selected.token}</span>
                  <h3 className="font-bold text-slate-800 text-base leading-tight">{selected.studentName}</h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-700 text-xl p-1 rounded-lg hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>

              {/* Status Selector */}
              <div className="p-4 border-b border-slate-100 bg-white space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Change Status</label>
                <div className="flex gap-2">
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="flex-1 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_EMOJI[s]} {s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => updateStatus(selected.id, newStatus)}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>

                {newStatus === "REJECTED" && (
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Reason (e.g. invalid document)..."
                    className="w-full border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs mt-1"
                  />
                )}
              </div>

              {/* Files Preview & Direct Actions */}
              <div className="p-4 flex-1 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Submitted Files ({selected.files.length})
                </h4>

                {selected.files.map((file) => (
                  <div key={file.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
                    {/* Inline Preview */}
                    {previewFile?.id === file.id && (
                      <div className="bg-slate-900 border-b border-slate-200">
                        {file.mimeType.includes("pdf") ? (
                          <iframe
                            src={`/api/files/${file.id}`}
                            className="w-full h-80"
                            title={file.originalName}
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/files/${file.id}`}
                            alt={file.originalName}
                            className="w-full max-h-80 object-contain mx-auto"
                          />
                        )}
                      </div>
                    )}

                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-xs truncate">{file.originalName}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{formatSize(file.fileSize)} • {file.mimeType}</p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-3 gap-1.5 mt-3">
                        <button
                          onClick={() => setPreviewFile(previewFile?.id === file.id ? null : file)}
                          className="border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs py-1.5 rounded-lg text-center font-medium"
                        >
                          {previewFile?.id === file.id ? "Hide" : "👁️ Preview"}
                        </button>

                        <Link
                          href={`/api/files/${file.id}`}
                          target="_blank"
                          download={file.originalName}
                          className="border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs py-1.5 rounded-lg text-center font-medium"
                        >
                          ⬇️ Save
                        </Link>

                        <button
                          onClick={() => directPrint(file.id, selected.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 rounded-lg text-center font-medium shadow-sm"
                        >
                          🖨️ Print
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Instant Delete Button */}
                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={() => deleteSubmission(selected.id)}
                    className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>🗑️</span> Delete This File & Submission Now
                  </button>
                  <p className="text-[11px] text-slate-400 text-center mt-1.5">
                    Wipes the file from disk immediately.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen QR Modal (for counter display / student-facing tablet) */}
      {fullscreenQr && qrData && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setFullscreenQr(false)}
              className="absolute right-5 top-5 text-slate-400 hover:text-slate-700 text-2xl font-bold p-1"
            >
              ✕
            </button>

            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">
              📱
            </div>

            <h2 className="text-2xl font-bold text-slate-900">College Print Counter</h2>
            <p className="text-slate-500 text-sm mt-1">Scan using phone camera to upload document</p>

            <div className="my-6 p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrData.qrDataUrl}
                alt="Student Upload QR Code"
                className="w-64 h-64 mx-auto object-contain bg-white p-2 rounded-xl"
              />
            </div>

            <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-xl border border-blue-100 text-left space-y-1 mb-6">
              <p className="font-semibold">Student Instructions:</p>
              <p>1. Open phone camera and point at this QR.</p>
              <p>2. Enter your name and pick a PDF or photo.</p>
              <p>3. Tap Submit — staff can print it immediately!</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = qrData.qrDataUrl;
                  a.download = "college-print-counter-qr.png";
                  a.click();
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-semibold shadow-md transition-colors"
              >
                ⬇️ Download PNG
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(qrData.url)}
                className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-700 py-3 rounded-xl text-sm font-semibold transition-colors"
              >
                📋 Copy Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
