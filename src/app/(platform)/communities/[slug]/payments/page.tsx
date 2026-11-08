import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { communityContext } from "@/lib/community";
import { listExternalPayments } from "@/lib/payment-records";
import { AppError } from "@/lib/errors";
import { PaymentRecordsWorkspace } from "@/components/payment-records-workspace";
import { PageHeading } from "@/components/ui";

export default async function PaymentRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const { community, isMember } = await communityContext(slug);
  if (!isMember) notFound();
  const query = await searchParams;
  if (Object.keys(query).some((key) => key !== "page")) notFound();
  const page = query.page ?? "1";
  if (typeof page !== "string" || !/^[1-9]\d{0,4}$/.test(page)) notFound();
  let view: Awaited<ReturnType<typeof listExternalPayments>>;
  try {
    view = await listExternalPayments(user.id, community.id, Number(page));
  } catch (error) {
    if (error instanceof AppError && [403, 404].includes(error.status))
      notFound();
    throw error;
  }
  return (
    <>
      <PageHeading
        eyebrow="EXTERNAL PAYMENTS, RECORDED WITH CONTEXT"
        title="A clear record of community funds."
        description="Document contributions, payouts and refunds handled outside Fundicate. Each entry records a staff attestation and preserves its correction history."
        action={
          <a
            className="button secondary"
            href={`/api/payments/export?communityId=${view.communityId}&page=${view.page}`}
            download
          >
            Export this page
          </a>
        }
      />
      <PaymentRecordsWorkspace view={view} />
    </>
  );
}
