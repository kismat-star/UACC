import { format } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function generateToken(): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const settingKey = `counter_${today}`;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.setting.findUnique({ where: { key: settingKey } });
    const next = existing ? parseInt(existing.value) + 1 : 1;
    await tx.setting.upsert({
      where: { key: settingKey },
      update: { value: String(next) },
      create: { key: settingKey, value: String(next) },
    });
    return next;
  });

  return `PRINT-${today}-${String(result).padStart(4, "0")}`;
}
