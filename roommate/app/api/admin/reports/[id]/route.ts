import { z } from "zod";
import { reviewReport } from "@/features/moderation/service";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";

const schema = z.object({ decision: z.enum(["dismissed", "actioned"]), moderatorNote: z.string().trim().max(1_000).optional() });
type Props = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Props) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return Response.json({ error: "Administrator access required." }, { status: 403 });
  const { id } = await params;
  const reportId = Number(id);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(reportId) || reportId <= 0 || !parsed.success) return Response.json({ error: "Provide a valid moderation decision." }, { status: 400 });
  if (!await reviewReport(reportId, user.id, parsed.data.decision, parsed.data.moderatorNote)) return Response.json({ error: "Pending report not found." }, { status: 404 });
  return Response.json({ ok: true });
}
