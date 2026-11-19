import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveUserStatus } from "@/lib/activeUser";
import { WorkspaceClient } from "@/components/WorkspaceClient";
import { BlockedAccountScreen } from "@/components/BlockedAccountScreen";

export const metadata: Metadata = {
  title: "סביבת עבודה — ContextLM מחברת מבוססת מקורות",
  description:
    "העלו עד 10 מקורות ושאלו שאלות מבוססות בלבד עם הפניות מאומתות.",
};

export default async function WorkspacePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userStatus = await getActiveUserStatus(session.user.id);
  if (userStatus.isBlocked) {
    return <BlockedAccountScreen reason={userStatus.blockedReason} />;
  }

  return (
    <WorkspaceClient
      user={{
        id: session.user.id,
        username: session.user.username,
        name: session.user.name,
        image: session.user.image,
        role: session.user.role,
      }}
    />
  );
}
