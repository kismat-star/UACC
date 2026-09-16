"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const ACCEPTED = ".pdf,.jpg,.jpeg,.png";
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const MAX_SIZE = 20 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const valid: File[] = [];
    const errs: string[] = [];
    Array.from(incoming).forEach((f) => {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        errs.push(`${f.name}: only PDF, JPG, PNG allowed`);
      } else if (f.size > MAX_SIZE) {
        errs.push(`${f.name}: exceeds 20 MB limit`);
      } else {
        valid.push(f);
      }
    });
    if (errs.length) setError(errs.join("\n"));
    setFiles((prev) => [...prev, ...valid]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (files.length === 0) { setError("Please upload at least one photo or PDF."); return; }

    setUploading(true);
    setProgress(0);

    try {
      const fd = new FormData();
      fd.append("studentName", name.trim());
      files.forEach((f) => fd.append("files", f));

      // XHR for real-time progress
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };

      const result = await new Promise<{ success: boolean; token?: string; error?: string }>((resolve, reject) => {
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("Invalid response")); }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", "/api/submit");
        xhr.send(fd);
      });

      if (result.success && result.token) {
        router.push(`/success?token=${result.token}&name=${encodeURIComponent(name.trim())}&files=${files.length}`);
      } else {
        setError(result.error || "Submission failed. Please try again.");
        setUploading(false);
      }
    } catch {
      setError("Upload failed. Please check your connection and try again.");
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 flex flex-col items-center px-4 py-6 sm:py-10">
      {/* Top Ephemeral Notice */}
      <div className="w-full max-w-md bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-6 flex items-center gap-2 text-xs text-emerald-800 shadow-sm">
        <span className="text-base">⏱️</span>
        <div>
          <span className="font-semibold">Ephemeral Storage:</span> Files are automatically deleted within 30 minutes after printing.
        </div>
      </div>

      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17H7a5 5 0 010-10h10a5 5 0 010 10zM12 3v14m0 0l-3-3m3 3l3-3" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">College Print Counter</h1>
        <p className="text-gray-500 mt-1 text-sm">Upload your document to print at the desk</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        {/* Name Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Student Full Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rahul Patel"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
            disabled={uploading}
            autoFocus
          />
        </div>

        {/* File Upload Box */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Choose Photo or PDF * <span className="text-gray-400 font-normal">(Max 20 MB)</span>
          </label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all bg-white shadow-sm
              ${dragging ? "border-blue-500 bg-blue-50/50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30"}
              ${uploading ? "opacity-60 cursor-not-allowed" : ""}
            `}
          >
            <div className="text-4xl mb-2">📸 📄</div>
            <p className="text-blue-600 font-semibold text-base">Tap to Select Photo or PDF</p>
            <p className="text-gray-400 text-xs mt-1">Supports PDF, JPG, PNG from phone</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
              disabled={uploading}
            />
          </div>

          {/* Selected files list */}
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm shadow-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">
                      {f.type.includes("pdf") ? "📄" : "🖼️"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-gray-800 font-medium text-xs sm:text-sm">{f.name}</p>
                      <p className="text-gray-400 text-xs">{formatSize(f.size)}</p>
                    </div>
                  </div>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-gray-50 text-base shrink-0"
                      title="Remove file"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm whitespace-pre-line shadow-sm">
            {error}
          </div>
        )}

        {/* Upload Progress */}
        {uploading && (
          <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100">
            <div className="flex justify-between text-xs font-semibold text-blue-800 mb-1.5">
              <span>Uploading to Counter...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={uploading}
          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:bg-blue-400 text-white font-semibold text-lg py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <span>Submit for Printing</span>
              <span>🚀</span>
            </>
          )}
        </button>

        {/* Privacy Note */}
        <p className="text-center text-xs text-gray-400 pt-2">
          🔒 No account needed • Instant counter pickup • Automatic privacy deletion
        </p>
      </form>
    </main>
  );
}
