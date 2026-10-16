// Serves one graffiti piece's drawing as a PNG, for the <img> tags on /wall.
import { and, eq, isNull } from "drizzle-orm";

import type { Route } from "./+types/wall.piece";
import { getDb } from "~/db/client.server";
import { graffitiPieces } from "~/db/schema";

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!/^\d{1,15}$/.test(params.id) || !Number.isSafeInteger(id) || id < 1) {
    return new Response("Not found", { status: 404 });
  }
  const [piece] = await getDb()
    .select({ imagePng: graffitiPieces.imagePng })
    .from(graffitiPieces)
    .where(and(eq(graffitiPieces.id, id), isNull(graffitiPieces.hiddenAt)))
    .limit(1);
  if (!piece) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(piece.imagePng, "base64"), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
