import { authorize } from "@/lib/dal";
import { buildProjectWorkbook } from "@/lib/excel";
import { getProjectData } from "@/lib/queries";
import { todayLK } from "@/lib/utils";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const data = await getProjectData(id);
  if (!data) return new Response("Not found", { status: 404 });
  const today = todayLK();
  const buf = await buildProjectWorkbook(data, today);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${data.project.projectCode}-Project-PnL-${today}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
