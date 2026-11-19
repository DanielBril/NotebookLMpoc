import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: Role;
      provider: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    username: string;
    role: Role;
    provider: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: Role;
    provider?: string;
  }
}
