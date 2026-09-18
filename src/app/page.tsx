"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { StudentUploadView } from "@/components/student-upload-view";
import { AdminAuthGate } from "@/components/admin-auth-gate";

function Router() {
  const params = useSearchParams();
  const uploadCode = params.get("upload")?.trim().toUpperCase();

  if (uploadCode) {
    return <StudentUploadView code={uploadCode} />;
  }
  return (
    <AdminAuthGate>
      <AdminDashboard />
    </AdminAuthGate>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-emerald-600" />
        </div>
      }
    >
      <Router />
    </Suspense>
  );
}
