import { FileText } from "lucide-react";

/** Private blobs are served through the authenticated /api/files route. */
export function AttachmentLink({ url, label = "View" }: { url: string | null; label?: string }) {
  if (!url) return null;
  return (
    <a href={`/api/files?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-info hover:underline">
      <FileText className="size-3.5" /> {label}
    </a>
  );
}
