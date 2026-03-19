import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, description, budget, scoringTopN, overseasCap } =
      await req.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "League name is required" },
        { status: 400 }
      );
    }

    const league = await prisma.league.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        budget: budget ?? 10000000,
        scoringTopN: scoringTopN ?? 7,
        overseasCap: overseasCap ?? 4,
        createdById: session.user.id,
        members: {
          create: {
            userId: session.user.id,
            role: "OWNER",
          },
        },
      },
    });

    return NextResponse.json(league, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create league" },
      { status: 500 }
    );
  }
}
