import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import prisma from "@/lib/prisma";

import type {
  CreateHousingRequestInput,
  HousingRequest,
  HousingRequestStatus,
  UpdateHousingRequestInput,
} from "./types";

const requestWithOwner = {
  include: { owner: true },
} satisfies Prisma.HousingRequestDefaultArgs;

type HousingRequestRecord = Prisma.HousingRequestGetPayload<typeof requestWithOwner>;

function toHousingRequest(record: HousingRequestRecord | null): HousingRequest | undefined {
  if (!record) return undefined;

  return {
    id: record.id,
    ownerId: record.ownerId,
    title: record.title,
    maxRent: record.maxRent,
    preferredLocation: record.preferredLocation,
    description: record.description,
    moveInDate: record.moveInDate,
    moveOutDate: record.moveOutDate,
    bedroomsNeeded: record.bedroomsNeeded,
    status: record.status as HousingRequest["status"],
    requestedBy: record.owner.name,
  };
}

export async function getHousingRequests(): Promise<HousingRequest[]> {
  const records = await prisma.housingRequest.findMany({
    ...requestWithOwner,
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
  });

  return records.map((record) => toHousingRequest(record)!);
}

export async function getHousingRequestById(id: number): Promise<HousingRequest | undefined> {
  // URL input must fit the positive PostgreSQL integer primary key.
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) return undefined;
  return toHousingRequest(
    await prisma.housingRequest.findUnique({
      ...requestWithOwner,
      where: { id },
    }),
  );
}

export async function getHousingRequestsForOwner(ownerId: number): Promise<HousingRequest[]> {
  const records = await prisma.housingRequest.findMany({
    ...requestWithOwner,
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });

  return records.map((record) => toHousingRequest(record)!);
}

export async function getHousingRequestsByIds(ids: number[]): Promise<HousingRequest[]> {
  if (ids.length === 0) return [];
  const records = await prisma.housingRequest.findMany({
    ...requestWithOwner,
    where: { id: { in: ids } },
  });
  const requestsById = new Map(records.map((record) => [record.id, toHousingRequest(record)!]));
  return ids.flatMap((id) => {
    const request = requestsById.get(id);
    return request ? [request] : [];
  });
}

export async function createHousingRequest(
  input: CreateHousingRequestInput,
  owner: CurrentUser,
): Promise<HousingRequest> {
  const record = await prisma.housingRequest.create({
    ...requestWithOwner,
    data: {
      ...input,
      owner: { connect: { id: owner.id } },
    },
  });

  return toHousingRequest(record)!;
}

export async function updateHousingRequestStatusForOwner(
  requestId: number,
  ownerId: number,
  status: HousingRequestStatus,
): Promise<boolean> {
  // Ownership is part of the query itself. This is safer than first fetching a
  // request and then updating it in a separate operation.
  const result = await prisma.housingRequest.updateMany({
    where: { id: requestId, ownerId },
    data: { status },
  });

  return result.count === 1;
}

export async function updateHousingRequestForOwner(
  requestId: number,
  ownerId: number,
  input: UpdateHousingRequestInput,
): Promise<HousingRequest | undefined> {
  return prisma.$transaction(async (transaction) => {
    const result = await transaction.housingRequest.updateMany({
      where: { id: requestId, ownerId },
      data: input,
    });

    if (result.count !== 1) return undefined;

    return toHousingRequest(
      await transaction.housingRequest.findUnique({
        ...requestWithOwner,
        where: { id: requestId },
      }),
    );
  });
}

export async function deleteHousingRequestForOwner(
  requestId: number,
  ownerId: number,
): Promise<boolean> {
  const result = await prisma.housingRequest.deleteMany({
    where: { id: requestId, ownerId },
  });

  return result.count === 1;
}
