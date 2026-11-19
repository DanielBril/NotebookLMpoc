import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { WorkspaceClient } from "@/components/WorkspaceClient";

export const metadata: Metadata = {
  title: "Workspace — ContextLM Grounded Notebook",
  description:
    "Upload up to 10 sources and ask strictly grounded questions with verified citations.",
};

export default async function WorkspacePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
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
