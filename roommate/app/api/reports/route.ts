import { z } from "zod";
import { createReport } from "@/features/moderation/service";
import { getCurrentUser } from "@/lib/current-user";

const reportSchema = z.object({
  targetType: z.enum(["listing", "housing_request"]),
  targetId: z.number().int().positive(),
  reason: z.enum(["scam", "harassment", "incorrect", "discrimination", "other"]),
  details: z.string().trim().max(1_000).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to submit a report." }, { status: 401 });
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a valid reason and keep details under 1,000 characters." }, { status: 400 });
  const report = await createReport(parsed.data, user.id);
  if (!report) return Response.json({ error: "The reported item no longer exists." }, { status: 404 });
  return Response.json({ id: report.id }, { status: 201 });
}
