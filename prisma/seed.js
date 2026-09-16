const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12);

  await prisma.admin.upsert({
    where: { email: "admin@college.edu" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@college.edu",
      passwordHash,
    },
  });

  console.log("✅ Seeded default admin:");
  console.log("   Email:    admin@college.edu");
  console.log("   Password: admin123");
  console.log("\n⚠️  Change these credentials after first login!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
