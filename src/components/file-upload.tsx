"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Paperclip, Loader2, CheckCircle2, X } from "lucide-react";
import type { ActionState } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toaster";

async function uploadFile(file: File, kind: "slips" | "bills"): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
  return json.url;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

/** File picker that uploads to Vercel Blob immediately and submits the URL via a hidden input. */
export function FileUploadField({ name, kind, label }: { name: string; kind: "slips" | "bills"; label: string }) {
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  // Clear the attachment when the parent form resets after a successful submit.
  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setUrl("");
      setFileName("");
      setError("");
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <div>
      <input ref={hiddenRef} type="hidden" name={name} value={url} />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setError("");
          setBusy(true);
          try {
            setUrl(await uploadFile(f, kind));
            setFileName(f.name);
          } catch (err) {
            setError((err as Error).message);
            setUrl("");
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <Paperclip />}
          {url ? "Replace file" : label}
        </Button>
        {url && (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="size-3.5" /> {fileName}
            <button type="button" className="text-muted-foreground hover:text-danger" onClick={() => setUrl("")} aria-label="Remove file">
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Attach a file to an existing record (receipt / expense) in one click. */
export function AttachButton({
  kind,
  onAttach,
  iconOnly,
}: {
  kind: "slips" | "bills";
  onAttach: (url: string) => Promise<ActionState>;
  iconOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            const url = await uploadFile(f, kind);
            start(async () => {
              const r = await onAttach(url);
              if (r.error) toast.error(r.error);
              else toast.success(r.message ?? "File attached");
            });
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size={iconOnly ? "icon" : "xs"}
        className={iconOnly ? "size-7" : undefined}
        disabled={busy || pending}
        onClick={() => inputRef.current?.click()}
        title={kind === "bills" ? "Attach supplier bill" : "Attach bank slip"}
        aria-label={kind === "bills" ? "Attach supplier bill" : "Attach bank slip"}
      >
        {busy || pending ? <Loader2 className="animate-spin" /> : <Paperclip />}
        {iconOnly ? null : " Attach"}
      </Button>
    </>
  );
}
