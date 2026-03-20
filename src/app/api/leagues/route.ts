import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Your session references a user that no longer exists. Please sign out and sign back in.",
        },
        { status: 401 }
      );
    }

    const { name, description, budget, scoringTopN, overseasCap, minBidIncrement } =
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
        minBidIncrement: minBidIncrement ?? 10000000,
        createdById: user.id,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    });

    return NextResponse.json(league, { status: 201 });
  } catch (err) {
    console.error("League creation failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create league";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
