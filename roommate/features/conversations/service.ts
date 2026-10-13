import { isEitherUserBlocked } from "@/features/blocks/service";
import type {
  ConversationDetail,
  ConversationParticipant,
  ConversationSubject,
  ConversationSummary,
} from "@/features/conversations/types";
import prisma from "@/lib/prisma";
import { DEMO_OWNER_EMAIL } from "@/features/listings/demo-data";

type StartConversationInput = { listingId: number; message: string };
type StartHousingRequestConversationInput = { housingRequestId: number; message: string };

export type StartConversationResult =
  | { kind: "created"; conversationId: number }
  | { kind: "listing-not-found" }
  | { kind: "own-listing" }
  | { kind: "blocked" };

export type StartHousingRequestConversationResult =
  | { kind: "created"; conversationId: number }
  | { kind: "request-not-found" }
  | { kind: "own-request" }
  | { kind: "blocked" };

export type SendMessageResult = "created" | "not-found" | "blocked";

const participantSelect = {
  id: true,
  name: true,
  affiliationType: true,
  affiliationName: true,
} as const;

function toConversationSubject(record: {
  listing: { id: number; title: string; status: string } | null;
  housingRequest: { id: number; title: string; status: string } | null;
}): ConversationSubject {
  if (record.listing) return { kind: "listing", ...record.listing };
  if (record.housingRequest) {
    return { kind: "housing_request", ...record.housingRequest };
  }

  throw new Error("Conversation has no marketplace subject.");
}

export async function startConversation(
  input: StartConversationInput,
  seekerId: number,
): Promise<StartConversationResult> {
  const listing = await prisma.listing.findFirst({
    where: { id: input.listingId, status: "active", owner: { email: { not: DEMO_OWNER_EMAIL } } },
    select: { ownerId: true },
  });

  if (!listing) return { kind: "listing-not-found" };
  if (listing.ownerId === seekerId) return { kind: "own-listing" };
  if (await isEitherUserBlocked(seekerId, listing.ownerId)) return { kind: "blocked" };

  const conversation = await prisma.$transaction(async (transaction) => {
    const thread = await transaction.conversation.upsert({
      where: { listingId_seekerId: { listingId: input.listingId, seekerId } },
      update: { updatedAt: new Date() },
      create: {
        listingId: input.listingId,
        ownerId: listing.ownerId,
        seekerId,
      },
    });
    await transaction.message.create({
      data: { conversationId: thread.id, senderId: seekerId, body: input.message },
    });
    return thread;
  });

  return { kind: "created", conversationId: conversation.id };
}

export async function startHousingRequestConversation(
  input: StartHousingRequestConversationInput,
  senderId: number,
): Promise<StartHousingRequestConversationResult> {
  const housingRequest = await prisma.housingRequest.findFirst({
    where: { id: input.housingRequestId, status: "active" },
    select: { ownerId: true },
  });

  if (!housingRequest) return { kind: "request-not-found" };
  if (housingRequest.ownerId === senderId) return { kind: "own-request" };
  if (await isEitherUserBlocked(senderId, housingRequest.ownerId)) {
    return { kind: "blocked" };
  }

  const conversation = await prisma.$transaction(async (transaction) => {
    const thread = await transaction.conversation.upsert({
      where: {
        housingRequestId_seekerId: {
          housingRequestId: input.housingRequestId,
          seekerId: senderId,
        },
      },
      update: { updatedAt: new Date() },
      create: {
        housingRequestId: input.housingRequestId,
        ownerId: housingRequest.ownerId,
        seekerId: senderId,
      },
    });
    await transaction.message.create({
      data: { conversationId: thread.id, senderId, body: input.message },
    });
    return thread;
  });

  return { kind: "created", conversationId: conversation.id };
}

export async function getConversationSummaries(userId: number): Promise<ConversationSummary[]> {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ ownerId: userId }, { seekerId: userId }] },
    include: {
      listing: { select: { id: true, title: true, status: true } },
      housingRequest: { select: { id: true, title: true, status: true } },
      owner: { select: participantSelect },
      seeker: { select: participantSelect },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          messages: { where: { senderId: { not: userId }, readAt: null } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return conversations.flatMap((conversation) => {
    const lastMessage = conversation.messages[0];
    if (!lastMessage) return [];
    return [{
      id: conversation.id,
      subject: toConversationSubject(conversation),
      otherParticipant: conversation.ownerId === userId
        ? conversation.seeker as ConversationParticipant
        : conversation.owner as ConversationParticipant,
      lastMessage: {
        body: lastMessage.body,
        senderId: lastMessage.senderId,
        createdAt: lastMessage.createdAt,
      },
      unreadCount: conversation._count.messages,
      updatedAt: conversation.updatedAt,
    }];
  });
}

export async function getConversationAndMarkRead(
  conversationId: number,
  userId: number,
): Promise<ConversationDetail | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, OR: [{ ownerId: userId }, { seekerId: userId }] },
    select: { id: true },
  });
  if (!conversation) return null;

  const record = await prisma.$transaction(async (transaction) => {
    await transaction.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });
    return transaction.conversation.findUnique({
      where: { id: conversationId },
      include: {
        listing: { select: { id: true, title: true, status: true } },
        housingRequest: { select: { id: true, title: true, status: true } },
        owner: { select: participantSelect },
        seeker: { select: participantSelect },
        messages: {
          include: { sender: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });
  if (!record) return null;

  return {
    id: record.id,
    subject: toConversationSubject(record),
    owner: record.owner,
    seeker: record.seeker,
    messages: record.messages.map((message) => ({
      id: message.id,
      body: message.body,
      senderId: message.senderId,
      senderName: message.sender.name,
      readAt: message.readAt,
      createdAt: message.createdAt,
    })),
  };
}

export async function sendConversationMessage(
  conversationId: number,
  senderId: number,
  body: string,
): Promise<SendMessageResult> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, OR: [{ ownerId: senderId }, { seekerId: senderId }] },
    select: { ownerId: true, seekerId: true },
  });
  if (!conversation) return "not-found";

  const recipientId = conversation.ownerId === senderId
    ? conversation.seekerId
    : conversation.ownerId;
  if (await isEitherUserBlocked(senderId, recipientId)) return "blocked";

  await prisma.$transaction([
    prisma.message.create({ data: { conversationId, senderId, body } }),
    prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ]);
  return "created";
}

export async function getUnreadConversationCount(userId: number): Promise<number> {
  return prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: userId },
      conversation: { OR: [{ ownerId: userId }, { seekerId: userId }] },
    },
  });
}
