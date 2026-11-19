import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      username?: string;
      name?: string;
      password?: string;
      confirmPassword?: string;
    };

    const rawUsername = (body.username ?? "").trim();
    const displayName = (body.name ?? "").trim();
    const password = body.password ?? "";
    const confirmPassword = body.confirmPassword ?? "";

    if (!USERNAME_REGEX.test(rawUsername)) {
      return NextResponse.json(
        {
          error:
            "Username must be 3–24 characters using only letters, numbers, and underscores.",
        },
        { status: 400 }
      );
    }

    if (!displayName || displayName.length > 60) {
      return NextResponse.json(
        { error: "Display name is required (max 60 characters)." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match." },
        { status: 400 }
      );
    }

    const normalizedUsername = rawUsername.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Username "${rawUsername}" is already taken.` },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        name: displayName,
        passwordHash,
        role: Role.USER,
        provider: "credentials",
        lastActiveAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("[Signup API] Error:", error);
    return NextResponse.json(
      { error: "Unable to create account right now. Please try again." },
      { status: 500 }
    );
  }
}
