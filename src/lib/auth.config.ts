import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { Role } from "@prisma/client";

const useIframePreviewCookies = process.env.IFRAME_PREVIEW_COOKIES === "true";

/**
 * Edge-compatible Auth.js configuration shared by middleware and server auth.
 * Does not import Prisma or bcryptjs so it runs safely in edge/proxy runtimes.
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  ...(useIframePreviewCookies
    ? {
        // Allow session & CSRF cookies inside embedded HTTPS preview iframes
        cookies: {
          sessionToken: {
            name: "authjs.session-token",
            options: {
              httpOnly: true,
              sameSite: "none" as const,
              path: "/",
              secure: true,
              partitioned: true,
            },
          },
          callbackUrl: {
            name: "authjs.callback-url",
            options: {
              sameSite: "none" as const,
              path: "/",
              secure: true,
              partitioned: true,
            },
          },
          csrfToken: {
            name: "authjs.csrf-token",
            options: {
              httpOnly: true,
              sameSite: "none" as const,
              path: "/",
              secure: true,
              partitioned: true,
            },
          },
        },
      }
    : {}),
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.provider = user.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.username = (token.username as string) ?? "";
        session.user.role = (token.role as Role) ?? "USER";
        session.user.provider = (token.provider as string) ?? "credentials";
      }
      return session;
    },
  },
};
