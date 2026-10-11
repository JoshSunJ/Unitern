import { getChatListingOptions, getPublicChatListing } from "@/features/housing-chat/data";
import { getNearbyPlaces } from "@/features/housing-chat/nearby";
import { answerHousingQuestion, ChatProviderError } from "@/features/housing-chat/service";
import { chatRequestSchema, sameChatOrigin } from "@/features/housing-chat/types";
import { enforceRateLimit, requestNetworkIdentifier } from "@/features/security/rate-limit";
import { normalizeEnvironmentValue } from "@/lib/environment-value";
import { logOperationalError } from "@/lib/operational-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("listingId");
  const id = value === null ? null : Number(value);
  if (id !== null && (!Number.isInteger(id) || id < 1 || id > 2_147_483_647)) {
    return Response.json({ error: "Invalid listing." }, { status: 400 });
  }
  try {
    return Response.json({ enabled: Boolean(normalizeEnvironmentValue(process.env.GEMINI_API_KEY)),
      listings: await getChatListingOptions(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The housing guide is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameChatOrigin(request, process.env.AUTH_URL)) return Response.json({ error: "Use the chat on Unitern." }, { status: 403 });
  const apiKey = normalizeEnvironmentValue(process.env.GEMINI_API_KEY);
  if (!apiKey) return Response.json({ error: "The housing guide is temporarily unavailable." }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 18_000) return Response.json({ error: "Please send a shorter conversation." }, { status: 413 });
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return Response.json({ error: "Please send a valid question." }, { status: 400 }); }
  const parsed = chatRequestSchema.safeParse(data);
  if (!parsed.success) return Response.json({ error: "Confirm the chat notice and ask a question of 2–1,000 characters." }, { status: 400 });
  try {
    // Shared counters protect every Cloud Run instance. No paid model fallback.
    for (const [scope, identifier, limit, windowMs] of [
      ["chat-network-minute", requestNetworkIdentifier(request), 3, 60_000],
      ["chat-global-minute", "unitern-free-chat", 4, 60_000],
      ["chat-global-day", "unitern-free-chat", 50, 24 * 60 * 60_000],
    ] as const) {
      const result = await enforceRateLimit({ scope, limit, windowMs }, identifier);
      if (!result.allowed) return Response.json({ error: "The free chat has reached its limit. Please try again later." }, {
        status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" },
      });
    }
    const input = parsed.data;
    const listing = input.listingId ? await getPublicChatListing(input.listingId) : null;
    if (input.listingId && !listing) return Response.json({ error: "This listing is no longer available. Choose another listing." }, { status: 404 });
    const coordinates = listing
      ? (listing.latitude !== null && listing.longitude !== null ? { latitude: listing.latitude, longitude: listing.longitude } : null)
      : input.area;
    const nearby = await getNearbyPlaces(coordinates);
    const reply = await answerHousingQuestion(input, listing, nearby, apiKey);
    return Response.json({ ...reply, listing: listing ? { id: listing.id, title: listing.title, location: listing.location } : null,
      mapStatus: nearby.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ChatProviderError ? error.status : undefined;
    logOperationalError("housing_chat.failed", { providerStatus: status });
    const exhausted = status === 429;
    return Response.json({ error: exhausted ? "The free AI model is at capacity. Please try again later." : "The guide couldn't answer just now. Please try again." }, {
      status: exhausted ? 429 : 503, headers: { "Cache-Control": "no-store", ...(exhausted ? { "Retry-After": "60" } : {}) },
    });
  }
}
