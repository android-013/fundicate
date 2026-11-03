import { communityContext } from "@/lib/community";
import { db } from "@/lib/db";
import { Avatar, Empty, SectionTitle } from "@/components/ui";
import { dateTime, titleCase } from "@/lib/format";
export default async function Activity({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { community: c } = await communityContext(slug);
  const events = await db.auditEvent.findMany({
    where: { communityId: c.id },
    include: { actor: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  return (
    <>
      <SectionTitle title="A shared history. An open record." />
      <p className="muted">
        Critical community decisions and financial actions are recorded here.
        Database rules prevent audit events from being edited or deleted.
      </p>
      <section className="panel padded">
        {events.length ? (
          <div className="audit-timeline">
            {events.map((e) => (
              <article key={e.id}>
                <Avatar name={e.actor.displayName} small />
                <div>
                  <div className="row between">
                    <h3>{titleCase(e.action)}</h3>
                    <time>{dateTime(e.createdAt)}</time>
                  </div>
                  <p>{e.actor.displayName}</p>
                  <details>
                    <summary>View recorded details</summary>
                    <div className="audit-details">
                      <span className="mono">
                        Event: {e.id}
                        <br />
                        Related record: {e.entityId}
                      </span>
                      <pre>{JSON.stringify(e.details, null, 2)}</pre>
                    </div>
                  </details>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="A new story begins here"
            description="Recorded decisions and transactions will appear in this history."
          />
        )}
      </section>
      <p className="muted small-text">
        Showing the latest 150 events. Full history is retained in the database.
      </p>
    </>
  );
}
