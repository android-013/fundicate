import { requireUser } from "@/lib/auth";
import { communityContext } from "@/lib/community";
import { getRoundTemplates } from "@/lib/round-templates";
import { RoundTemplates } from "@/components/round-templates";
import { PageHeading } from "@/components/ui";
import { z } from "zod";

export default async function CommunityTemplates({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const { community } = await communityContext(slug);
  const page = z.coerce.number().int().min(1).max(100000).catch(1).parse((await searchParams).page ?? 1);
  const view = await getRoundTemplates(user.id, community.id, page);
  return <><PageHeading eyebrow="COMMUNITY TEMPLATES" title="Good rules are worth reusing." description="Versioned setups for the next decision, with a separate immutable snapshot for every round." /><RoundTemplates view={view} /></>;
}
