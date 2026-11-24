import { get } from "@vercel/blob";
import { authorize } from "@/lib/dal";

const BLOB_HOST = /^[a-z0-9-]+\.(private\.|public\.)?blob\.vercel-storage\.com$/i;

/** Authenticated delivery of private blobs: /api/files?url=<blob url> */
export async function GET(request: Request) {
  try {
    await authorize();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const raw = new URL(request.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (target.protocol !== "https:" || !BLOB_HOST.test(target.hostname)) {
    return new Response("Bad request", { status: 400 });
  }
  const result = await get(target.toString(), { access: "private" }).catch(() => null);
  if (!result || result.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
