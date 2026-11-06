import { communityContext } from "@/lib/community";
import { getCommunityReputation } from "@/lib/reputation";
import { ReputationHub } from "@/components/reputation";

export default async function CommunityReputation({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { community, user } = await communityContext(slug);
  const view = await getCommunityReputation(community.id, user?.id);
  return <ReputationHub communityId={community.id} view={view} />;
}
