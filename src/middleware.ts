import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const session = req.auth;
  const isLoggedIn = Boolean(session?.user);
  const role = session?.user?.role;

  // Protect Developer API routes strictly with 401/403
  if (pathname.startsWith("/api/developer")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (role !== "DEVELOPER" && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Developer access required" },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  // Protect Developer pages strictly
  if (pathname.startsWith("/developer")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    if (role !== "DEVELOPER" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/workspace", nextUrl));
    }
    return NextResponse.next();
  }

  // Protect Admin API routes strictly with 401/403 (DEVELOPER & ADMIN allowed)
  if (pathname.startsWith("/api/admin")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (role !== "ADMIN" && role !== "DEVELOPER") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  // Protect Admin pages strictly
  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    if (role !== "ADMIN" && role !== "DEVELOPER") {
      return NextResponse.redirect(new URL("/workspace", nextUrl));
    }
    return NextResponse.next();
  }

  // Protect authenticated API routes (documents, chat, studio)
  if (
    pathname.startsWith("/api/documents") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/studio")
  ) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Protect workspace route
  if (pathname.startsWith("/workspace")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    return NextResponse.next();
  }

  // Redirect already-authenticated users away from auth pages
  if ((pathname === "/login" || pathname === "/signup") && isLoggedIn) {
    const dest =
      role === "DEVELOPER"
        ? "/developer"
        : role === "ADMIN"
          ? "/admin"
          : "/workspace";
    return NextResponse.redirect(new URL(dest, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/workspace/:path*",
    "/admin/:path*",
    "/developer/:path*",
    "/api/admin/:path*",
    "/api/developer/:path*",
    "/api/documents/:path*",
    "/api/chat/:path*",
    "/api/studio/:path*",
    "/login",
    "/signup",
  ],
};
