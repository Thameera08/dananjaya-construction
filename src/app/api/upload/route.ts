import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { authorize, AuthzError } from "@/lib/dal";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel Functions accept ~4.5 MB request bodies
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["application/pdf", "pdf"],
]);
const KINDS = new Set(["slips", "bills"]);

/**
 * Upload a bank slip (RC-xxx) or supplier bill (EX-xxx) to the PRIVATE Vercel Blob store.
 * Files are only ever served back through /api/files, which checks the session.
 */
export async function POST(request: Request) {
  try {
    await authorize("uploadFiles");
  } catch (e) {
    const msg = e instanceof AuthzError ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "File storage is not configured (BLOB_READ_WRITE_TOKEN missing)." }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "bills");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Invalid upload kind" }, { status: 400 });
  const ext = ALLOWED.get(file.type);
  if (!ext) return NextResponse.json({ error: "Only JPG, PNG, WEBP, HEIC or PDF files are allowed" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be 4 MB or smaller" }, { status: 413 });

  const month = new Date().toISOString().slice(0, 7);
  const blob = await put(`${kind}/${month}/${randomUUID()}.${ext}`, file, {
    access: "private",
    contentType: file.type,
    addRandomSuffix: false,
  });
  return NextResponse.json({ url: blob.url, pathname: blob.pathname, name: file.name });
}
