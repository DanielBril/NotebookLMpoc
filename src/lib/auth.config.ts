import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { Role } from "@prisma/client";

const googleClientId =
  (process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID ?? "").trim();
const googleClientSecret =
  (process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET ?? "").trim();

export const isGoogleOAuthConfigured =
  Boolean(googleClientId) &&
  Boolean(googleClientSecret) &&
  googleClientId !== "your-google-oauth-client-id" &&
  googleClientSecret !== "your-google-oauth-client-secret";

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
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(isGoogleOAuthConfigured
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
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
