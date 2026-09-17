import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toSessionShape, type SessionShape } from "@/lib/types";
import { notify } from "@/lib/ws-notify";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily-confused chars
const CODE_LENGTH = 6;

function generateCode(): string {
  let out = "";
  const buf = new Uint32Array(CODE_LENGTH);
  // globalThis.crypto.getRandomValues is available in Node's WebCrypto
  // (Node 19+), which is what Next 16 runtime uses for route handlers.
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  }
  return out;
}

async function generateUniqueCode(): Promise<string> {
  // Retry on collision up to 10 times.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const existing = await db.session.findUnique({ where: { code } });
    if (!existing) return code;
  }
  // Extremely unlikely — fall back to a longer random string.
  return generateCode() + Math.floor(Math.random() * 10);
}

export async function GET() {
  const sessions = await db.session.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { files: true } } },
  });
  const shapes: SessionShape[] = sessions.map((s) => toSessionShape(s));
  return NextResponse.json({ sessions: shapes });
}

export async function POST(req: Request) {
  let body: { name?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const code = await generateUniqueCode();
  const session = await db.session.create({
    data: { name, code },
    include: { _count: { select: { files: true } } },
  });
  const shape = toSessionShape(session);

  // Best-effort notify; do not block response on it.
  void notify("session-updated", { session: shape });

  return NextResponse.json({ session: shape }, { status: 201 });
}
