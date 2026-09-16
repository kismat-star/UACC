"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const token = params.get("token") || "PRINT---------";
  const name = params.get("name") || "Student";
  const files = params.get("files") || "1";
  const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col items-center px-4 py-10">
      {/* Success Icon */}
      <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-lg">
        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Submission Successful!</h1>
      <p className="text-gray-500 mb-8 text-sm">Show this token at the college counter</p>

      {/* Token Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center mb-6">
        <p className="text-sm text-gray-500 mb-2 uppercase tracking-widest font-medium">Your Token Number</p>
        <p className="text-3xl font-bold text-blue-600 tracking-wider font-mono break-all">{token}</p>
        <div className="mt-6 pt-5 border-t border-gray-100 text-left space-y-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span className="text-gray-400">Student</span>
            <span className="font-medium text-gray-800">{name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Files</span>
            <span className="font-medium text-gray-800">{files}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Time</span>
            <span className="font-medium text-gray-800">{now}</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Link href="/"
          className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-colors">
          Submit Another File
        </Link>
        <div className="text-center text-sm text-gray-400 py-2">
          📋 Screenshot this page to save your token number
        </div>
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
