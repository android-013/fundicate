import { notFound } from "next/navigation";
import { db } from "./db";
import { currentUser } from "./auth";
export async function communityContext(slug: string) {
  const [community, user] = await Promise.all([
    db.community.findUnique({
      where: { slug },
      include: {
        policy: true,
        questions: true,
        accounts: true,
        admin: { select: { id: true, displayName: true } },
        _count: {
          select: {
            memberships: { where: { status: "ACTIVE" } },
            proposals: true,
          },
        },
      },
    }),
    currentUser(),
  ]);
  if (!community) notFound();
  const membership = user
    ? await db.communityMembership.findUnique({
        where: {
          communityId_userId: { communityId: community.id, userId: user.id },
        },
      })
    : null;
  const isMember = membership?.status === "ACTIVE";
  const isAdmin = isMember && community.adminId === user?.id;
  const isStaff = isMember && (isAdmin || membership?.role === "MODERATOR");
  return { community, user, membership, isMember, isAdmin, isStaff };
}
