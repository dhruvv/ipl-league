import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireLeagueMember } from "@/lib/auction-helpers";
import { scoringEmitter } from "@/lib/scoring-events";
import { touchScoringAudience } from "@/lib/scoring-audience";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const member = await requireLeagueMember(leagueId, session.user.id);
    if (!member) {
      return new Response("Forbidden", { status: 403 });
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        function send(event: string, data: unknown) {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        }

        send("connected", { leagueId });
        touchScoringAudience();

        const unsubscribe = scoringEmitter.subscribe(leagueId, (event) => {
          send(event.type, event.data);
        });

        const keepalive = setInterval(() => {
          try {
            touchScoringAudience();
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            clearInterval(keepalive);
          }
        }, 15_000);

        const abortHandler = () => {
          unsubscribe();
          clearInterval(keepalive);
          try {
            controller.close();
          } catch {
            // already closed
          }
        };

        _req.signal.addEventListener("abort", abortHandler);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("GET /api/leagues/[id]/scoring/stream error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
