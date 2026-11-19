import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

function sanitizeUsernameBase(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 18);
  return cleaned.length >= 3 ? cleaned : `user_${cleaned || "ctx"}`;
}

async function generateUniqueUsername(email?: string | null, name?: string | null): Promise<string> {
  const base = sanitizeUsernameBase(
    (email ? email.split("@")[0] : name) || "contextuser"
  );

  let candidate = base;
  let attempt = 0;
  while (attempt < 20) {
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    attempt += 1;
    const suffix = Math.floor(100 + Math.random() * 900);
    candidate = `${base.slice(0, 19)}_${suffix}`;
  }
  return `user_${Date.now().toString(36).slice(-8)}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const rawUsername = typeof credentials?.username === "string" ? credentials.username.trim() : "";
        const rawPassword = typeof credentials?.password === "string" ? credentials.password : "";

        if (!rawUsername || !rawPassword) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username: rawUsername.toLowerCase() },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const passwordValid = await bcrypt.compare(rawPassword, user.passwordHash);
        if (!passwordValid) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastActiveAt: new Date() },
        });

        return {
          id: user.id,
          username: user.username,
          name: user.name ?? user.username,
          email: user.email,
          image: user.image,
          role: user.role,
          provider: user.provider,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase();
        if (!email) return false;

        let dbUser = await prisma.user.findUnique({
          where: { email },
        });

        if (!dbUser) {
          const username = await generateUniqueUsername(email, user.name);
          dbUser = await prisma.user.create({
            data: {
              username,
              email,
              name: user.name ?? username,
              image: user.image,
              role: Role.USER,
              provider: "google",
              lastActiveAt: new Date(),
            },
          });
        } else {
          dbUser = await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              lastActiveAt: new Date(),
              image: user.image ?? dbUser.image,
              name: user.name ?? dbUser.name,
            },
          });
        }

        user.id = dbUser.id;
        user.username = dbUser.username;
        user.role = dbUser.role;
        user.provider = dbUser.provider;
      }
      return true;
    },
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
        session.user.role = (token.role as Role) ?? Role.USER;
        session.user.provider = (token.provider as string) ?? "credentials";
      }
      return session;
    },
  },
});
