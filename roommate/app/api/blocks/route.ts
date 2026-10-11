import { z } from "zod";
import { blockUser, unblockUser } from "@/features/blocks/service";
import { getCurrentUser } from "@/lib/current-user";

const blockSchema = z.object({ blockedUserId: z.number().int().positive() });

async function readUsers(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: Response.json({ error: "Sign in to manage blocks." }, { status: 401 }) };
  const parsed = blockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.blockedUserId === currentUser.id) return { error: Response.json({ error: "Choose a valid user." }, { status: 400 }) };
  return { currentUser, blockedUserId: parsed.data.blockedUserId };
}

export async function POST(request: Request) {
  const result = await readUsers(request);
  if ("error" in result) return result.error;
  const blocked = await blockUser(result.currentUser.id, result.blockedUserId);
  if (!blocked) return Response.json({ error: "User not found." }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const result = await readUsers(request);
  if ("error" in result) return result.error;
  await unblockUser(result.currentUser.id, result.blockedUserId);
  return Response.json({ ok: true });
}
