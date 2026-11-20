import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Remove any previously seeded mock/demo users or automated QA test accounts
  const deletedMockUsers = await prisma.user.deleteMany({
    where: {
      OR: [
        {
          username: {
            in: ["maya_cohen", "daniel_levi", "noam_barak"],
          },
        },
        {
          username: {
            startsWith: "qa_runner_",
          },
        },
      ],
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
  const developerHash = await bcrypt.hash("Developer", 10);

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

  const developer = await prisma.user.upsert({
    where: { username: "developer" },
    update: {
      role: Role.DEVELOPER,
      name: "System Developer",
      passwordHash: developerHash,
      provider: "credentials",
      isBlocked: false,
      blockedAt: null,
      blockedReason: null,
    },
    create: {
      username: "developer",
      email: "developer@contextlm.local",
      name: "System Developer",
      passwordHash: developerHash,
      role: Role.DEVELOPER,
      provider: "credentials",
      isBlocked: false,
    },
  });

  console.log(
    `[ContextLM Seed] Cleaned ${deletedMockUsers.count} mock users & ${deletedMockLogs.count} mock logs. Accounts ready: Admin ("${admin.username}" / "admin") & Developer ("Developer" / "Developer", id=${developer.id})`
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
