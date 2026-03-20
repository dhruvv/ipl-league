import { auth } from "@/lib/auth";
import { requireLeagueMember, getAuctionState } from "@/lib/auction-helpers";
import { auctionEmitter } from "@/lib/auction-events";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const member = await requireLeagueMember(leagueId, session.user.id);
  if (!member) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const state = await getAuctionState(leagueId);
      controller.enqueue(
        encoder.encode(
          `event: state-sync\ndata: ${JSON.stringify(state)}\n\n`
        )
      );

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15000);

      unsubscribe = auctionEmitter.subscribe(leagueId, (event) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
            )
          );
        } catch {
          clearInterval(keepalive);
          unsubscribe?.();
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
