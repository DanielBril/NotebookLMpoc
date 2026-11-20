import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role === "DEVELOPER") {
    redirect("/developer");
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin");
  }

  redirect("/workspace");
}
