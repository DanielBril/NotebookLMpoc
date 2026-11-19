import { prisma } from "@/lib/prisma";

export interface ActiveUserStatus {
  exists: boolean;
  isBlocked: boolean;
  blockedReason: string | null;
}

/**
 * Performs a live DB check so blocking a user takes effect immediately
 * even if they already hold a valid JWT session cookie.
 */
export async function getActiveUserStatus(userId: string): Promise<ActiveUserStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isBlocked: true, blockedReason: true },
  });

  if (!user) {
    return { exists: false, isBlocked: false, blockedReason: null };
  }

  return {
    exists: true,
    isBlocked: user.isBlocked,
    blockedReason: user.blockedReason ?? null,
  };
}
