import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Remove any previously seeded mock/demo users and any mock-model usage logs
  const deletedMockUsers = await prisma.user.deleteMany({
    where: {
      username: {
        in: ["maya_cohen", "daniel_levi", "noam_barak"],
      },
    },
  });

  const deletedMockLogs = await prisma.usageLog.deleteMany({
    where: {
      model: {
        contains: "mock",
      },
    },
  });

  const adminHash = await bcrypt.hash("admin", 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      role: Role.ADMIN,
      name: "מנהל מערכת",
      passwordHash: adminHash,
      provider: "credentials",
      isBlocked: false,
      blockedAt: null,
      blockedReason: null,
    },
    create: {
      username: "admin",
      email: "admin@contextlm.local",
      name: "מנהל מערכת",
      passwordHash: adminHash,
      role: Role.ADMIN,
      provider: "credentials",
      isBlocked: false,
    },
  });

  console.log(
    `[ContextLM Seed] Cleaned ${deletedMockUsers.count} mock users & ${deletedMockLogs.count} mock logs. Admin ready: username="${admin.username}" / password="admin" (id=${admin.id})`
  );
}

main()
  .catch((error) => {
    console.error("[ContextLM Seed] Failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
