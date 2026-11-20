import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { DeveloperDashboardClient } from "@/components/developer/DeveloperDashboardClient";

export const metadata: Metadata = {
  title: "מרכז שליטה ודיאגנוסטיקה למפתחים — ContextLM",
  description:
    "לוגים ושגיאות מערכת, בריאות שרת ו-DOMMatrix, עלויות וחיסכון מטמון, וכלי תיקון עצמי אוטומטיים.",
};

export default async function DeveloperPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (
    session.user.role !== Role.DEVELOPER &&
    session.user.role !== Role.ADMIN
  ) {
    redirect("/workspace");
  }

  return (
    <DeveloperDashboardClient
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
