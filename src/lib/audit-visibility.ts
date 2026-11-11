import type { Prisma } from "@prisma/client";

const staffActions = ["REPUTATION_ABUSE_REPORTED"];
const memberActions = [
  "EXTERNAL_PAYMENT_RECORDED",
  "EXTERNAL_PAYMENT_REVERSED",
];

/** Apply in the database query, before limits, aggregation, export or inspection. */
export function auditVisibilityWhere(
  memberCommunityIds: string[] = [],
  staffCommunityIds: string[] = [],
): Prisma.AuditEventWhereInput {
  return {
    OR: [
      { action: { notIn: [...staffActions, ...memberActions] } },
      {
        action: { in: memberActions },
        communityId: { in: memberCommunityIds },
      },
      { action: { in: staffActions }, communityId: { in: staffCommunityIds } },
    ],
  };
}

export function auditVisibilityForMemberships(
  userId: string,
  memberships: {
    communityId: string;
    role: string;
    community: { adminId: string };
  }[],
) {
  return auditVisibilityWhere(
    memberships.map((m) => m.communityId),
    memberships
      .filter((m) => m.community.adminId === userId || m.role === "MODERATOR")
      .map((m) => m.communityId),
  );
}
