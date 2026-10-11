import { z } from "zod";

export const CHAT_MODEL = "gemini-3.5-flash-lite";

const areaSchema = z.object({
  label: z.string().trim().min(2).max(250),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();
export type ChatArea = z.infer<typeof areaSchema>;

export const chatRequestSchema = z.object({
  message: z.string().trim().min(2).max(1_000),
  listingId: z.number().int().positive().max(2_147_483_647).nullable(),
  area: areaSchema.nullable().default(null),
  consent: z.literal(true),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string().trim().min(1).max(2_500),
  })).max(6).default([]),
}).strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ListingOption = { id: number; title: string; location: string };
export type ChatSource = { id: string; title: string; url: string };
export type ChatReply = {
  answer: string;
  sources: ChatSource[];
  listing: ListingOption | null;
  mapStatus: "available" | "unavailable" | "no-location";
};

export function listingIdFromPath(pathname: string | null) {
  const match = pathname?.match(/^\/listings\/(\d+)\/?$/);
  const id = Number(match?.[1]);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

export function sameChatOrigin(request: Request, canonicalUrl?: string) {
  try {
    const origin = request.headers.get("origin");
    return Boolean(origin) && new URL(origin!).origin === new URL(canonicalUrl || request.url).origin;
  } catch {
    return false;
  }
}
