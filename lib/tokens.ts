import { format } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function generateToken(): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const settingKey = `counter_${today}`;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.setting.findUnique({ where: { key: settingKey } });
        const next = existing ? parseInt(existing.value) + 1 : 1;
        await tx.setting.upsert({
          where: { key: settingKey },
          update: { value: String(next) },
          create: { key: settingKey, value: String(next) },
        });
        return next;
      },
      { timeout: 10000 }
    );

    return `PRINT-${today}-${String(result).padStart(4, "0")}`;
  } catch (err) {
    console.error("Token transaction warning, falling back to random counter:", err);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `PRINT-${today}-${randomSuffix}`;
  }
}
