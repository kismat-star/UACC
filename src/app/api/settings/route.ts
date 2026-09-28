import { NextResponse } from "next/server";
import { getSettings, updateSettings, incrementPrintCount } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    settings: {
      autoDeleteAfterPrint: settings.autoDeleteAfterPrint,
      retentionHours: settings.retentionHours,
      totalPrintsCount: settings.totalPrintsCount,
    },
  });
}

export async function POST(req: Request) {
  let count = 1;
  try {
    const body = await req.json();
    if (typeof body.count === "number" && Number.isFinite(body.count) && body.count > 0) {
      count = Math.floor(body.count);
    }
  } catch {
    // fallback count 1
  }
  const total = await incrementPrintCount(count);
  return NextResponse.json({ totalPrintsCount: total });
}

export async function PATCH(req: Request) {
  let body: {
    autoDeleteAfterPrint?: unknown;
    retentionHours?: unknown;
    deleteAfterPrint?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: {
    autoDeleteAfterPrint?: boolean;
    retentionHours?: number;
  } = {};

  if (typeof body.autoDeleteAfterPrint === "boolean") {
    patch.autoDeleteAfterPrint = body.autoDeleteAfterPrint;
  } else if (typeof body.deleteAfterPrint === "boolean") {
    // Accept legacy alias too.
    patch.autoDeleteAfterPrint = body.deleteAfterPrint;
  }

  if (typeof body.retentionHours === "number" && Number.isFinite(body.retentionHours)) {
    patch.retentionHours = body.retentionHours;
  } else if (typeof body.retentionHours === "string") {
    const parsed = Number.parseInt(body.retentionHours, 10);
    if (Number.isFinite(parsed)) {
      patch.retentionHours = parsed;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields provided" },
      { status: 400 },
    );
  }

  const settings = await updateSettings(patch);
  return NextResponse.json({ settings });
}
