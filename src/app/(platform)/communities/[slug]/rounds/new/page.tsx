import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { communityContext } from "@/lib/community";
import { FundingRoundForm } from "@/components/round-forms";
export default async function NewFundingRound({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const { community, isStaff } = await communityContext(slug);
  if (!isStaff) notFound();
  return (
    <>
      <Link className="back-link" href={`/communities/${slug}/rounds`}>
        ← Funding rounds
      </Link>
      <div className="section-title">
        <div>
          <h2>Set the purpose. Publish the rules.</h2>
          <p className="muted">
            Create a draft, review its rules, then open it for schemes.
          </p>
        </div>
      </div>
      <section className="panel padded round-form-panel">
        <FundingRoundForm communityId={community.id} />
      </section>
    </>
  );
}
