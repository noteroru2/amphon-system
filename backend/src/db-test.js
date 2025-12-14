const { prisma } = require("./prisma");

async function main() {
  await prisma.$connect();
  console.log("✅ Prisma connected");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Prisma connect failed:", e);
  process.exit(1);
});
