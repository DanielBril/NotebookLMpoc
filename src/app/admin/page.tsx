import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";

export const metadata: Metadata = {
  title: "מרכז בקרה וניהול — ContextLM",
  description:
    "פורטל בקרה לניהול משתמשים, מדדי שימוש, חסימת משתמשים ובקרת תכנים שסומנו כמסוכנים בלבד.",
};

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (
    session.user.role !== Role.ADMIN &&
    session.user.role !== Role.DEVELOPER
  ) {
    redirect("/workspace");
  }

  return (
    <AdminDashboardClient
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
