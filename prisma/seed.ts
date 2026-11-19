import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin", 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      role: Role.ADMIN,
      name: "System Administrator",
      passwordHash,
      provider: "credentials",
    },
    create: {
      username: "admin",
      email: "admin@contextlm.local",
      name: "System Administrator",
      passwordHash,
      role: Role.ADMIN,
      provider: "credentials",
    },
  });

  console.log(
    `[ContextLM Seed] Upserted admin account: username="${admin.username}", role="${admin.role}" (id=${admin.id})`
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
