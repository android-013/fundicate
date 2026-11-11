import { Prisma } from "@prisma/client";
import { db } from "./db";
import { ensure } from "./errors";
import { atomic } from "./service";
import { calculateOutcome } from "./governance";
import { auditVisibilityForMemberships } from "./audit-visibility";
import {
  analyticsHref,
  averageMinor,
  buildTrend,
  changePercent,
  dashboardWidgets,
  medianMinor,
  periodFor,
  preferenceSchema,
  savedViewSchema,
  type AnalyticsFilters,
} from "./analytics-core";
const identity = {
  id: true,
  displayName: true,
  username: true,
  avatarUrl: true,
} as const;
export async function analyticsScope(
  userId: string,
  filters: AnalyticsFilters,
) {
  const memberships = await db.communityMembership.findMany({
    where: { userId, status: "ACTIVE" },
    include: { community: { include: { accounts: true } } },
    orderBy: { joinedAt: "asc" },
  });
  ensure(
    filters.community === "all" ||
      memberships.some((m) => m.community.slug === filters.community),
    "Analytics are available only for your active communities.",
    403,
  );
  const selected = memberships.filter(
    (m) =>
      (filters.community === "all" || m.community.slug === filters.community) &&
      (filters.currency === "all" || m.community.currency === filters.currency),
  );
  return { memberships, selected, ids: selected.map((m) => m.communityId) };
}
export async function getAnalytics(userId: string, filters: AnalyticsFilters) {
  const scope = await analyticsScope(userId, filters);
  const period = periodFor(filters);
  const date = {
    ...(period.start ? { gte: period.start } : {}),
    lt: period.end,
  };
  const communityId = { in: scope.ids };
  const raw = await db.$transaction(
    async (tx) => {
      const [
        transactions,
        proposals,
        votes,
        members,
        activity,
        opening,
        previous,
        savedViews,
        preference,
      ] = await Promise.all([
        tx.ledgerTransaction.findMany({
          where: { communityId, createdAt: date, status: "CONFIRMED" },
          include: {
            initiatedBy: { select: identity },
            community: {
              select: { id: true, name: true, slug: true, currency: true },
            },
            entries: { include: { account: { select: { kind: true } } } },
            proposal: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: "asc" },
          take: 50001,
        }),
        tx.proposal.findMany({
          where: { communityId, createdAt: date },
          include: {
            votes: { include: { user: { select: identity } } },
            eligibleVoters: { where: { userId }, select: { userId: true } },
            _count: { select: { eligibleVoters: true } },
            community: { select: { name: true, slug: true, currency: true } },
            proposer: { select: identity },
          },
          orderBy: { createdAt: "desc" },
          take: 50001,
        }),
        tx.vote.findMany({
          where: { proposal: { communityId }, createdAt: date },
          include: {
            user: { select: identity },
            proposal: {
              select: {
                id: true,
                title: true,
                communityId: true,
                community: { select: { name: true, slug: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50001,
        }),
        tx.communityMembership.findMany({
          where: { communityId },
          include: {
            user: { select: identity },
            community: { select: { name: true, slug: true, adminId: true } },
          },
          orderBy: { joinedAt: "desc" },
          take: 50001,
        }),
        tx.auditEvent.findMany({
          where: {
            communityId,
            createdAt: date,
            AND: [auditVisibilityForMemberships(userId, scope.selected)],
          },
          include: {
            actor: { select: identity },
            community: { select: { name: true, slug: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50001,
        }),
        period.start
          ? tx.ledgerEntry.groupBy({
              by: ["accountId"],
              where: {
                account: { kind: "TREASURY", communityId },
                transaction: {
                  status: "CONFIRMED",
                  createdAt: { lt: period.start },
                },
              },
              _sum: { amount: true },
            })
          : Promise.resolve([]),
        period.start
          ? tx.ledgerTransaction.findMany({
              where: {
                communityId,
                status: "CONFIRMED",
                createdAt: {
                  gte: new Date(
                    period.start.getTime() -
                      (period.end.getTime() - period.start.getTime()),
                  ),
                  lt: period.start,
                },
              },
              include: {
                entries: { include: { account: { select: { kind: true } } } },
              },
              take: 50001,
            })
          : Promise.resolve([]),
        tx.savedAnalyticsView.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        tx.dashboardPreference.findUnique({ where: { userId } }),
      ]);
      for (const rows of [
        transactions,
        proposals,
        votes,
        members,
        activity,
        previous,
      ])
        ensure(
          rows.length <= 50000,
          "This report exceeds 50,000 records. Choose a narrower date range or one community.",
          422,
        );
      return {
        transactions,
        proposals,
        votes,
        members,
        activity,
        opening,
        previous,
        savedViews,
        preference,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
  const treasuryDelta = (t: {
    entries: { amount: bigint; account: { kind: string } }[];
  }) =>
    t.entries
      .filter((e) => e.account.kind === "TREASURY")
      .reduce((s, e) => s + e.amount, 0n);
  const transactions = raw.transactions.map((t) => ({
    ...t,
    delta: treasuryDelta(t),
  }));
  const joined = raw.members.filter(
    (m) =>
      (!period.start || m.joinedAt >= period.start) && m.joinedAt < period.end,
  );
  const currencyCodes = [
    ...new Set(scope.selected.map((m) => m.community.currency)),
  ];
  const money = currencyCodes.map((currency) => {
    const communities = scope.selected.filter(
      (m) => m.community.currency === currency,
    );
    const ids = new Set(communities.map((m) => m.communityId));
    const rows = transactions.filter((t) => ids.has(t.communityId));
    const incoming = rows.reduce(
      (s, t) => s + (t.delta > 0n ? t.delta : 0n),
      0n,
    );
    const outgoing = rows.reduce(
      (s, t) => s + (t.delta < 0n ? -t.delta : 0n),
      0n,
    );
    const opening = communities.reduce(
      (s, c) =>
        s +
        (raw.opening.find(
          (a) =>
            a.accountId ===
            c.community.accounts.find((a) => a.kind === "TREASURY")?.id,
        )?._sum.amount ?? 0n),
      0n,
    );
    const current = communities.reduce(
      (s, c) =>
        s +
        (c.community.accounts.find((a) => a.kind === "TREASURY")?.balance ??
          0n),
      0n,
    );
    const approved = raw.proposals
      .filter(
        (p) =>
          ids.has(p.communityId) &&
          p.type === "FUNDING" &&
          p.status === "APPROVED",
      )
      .reduce((s, p) => s + p.amount, 0n);
    const amounts = rows.filter((t) => t.delta > 0n).map((t) => t.delta);
    const contributors = new Set(
      rows.filter((t) => t.delta > 0n).map((t) => t.initiatedById),
    ).size;
    const own = rows
      .filter((t) => t.initiatedById === userId && t.delta > 0n)
      .reduce((s, t) => s + t.delta, 0n);
    const previousIncoming = raw.previous
      .filter((t) => ids.has(t.communityId))
      .reduce((s, t) => {
        const d = treasuryDelta(t);
        return s + (d > 0n ? d : 0n);
      }, 0n);
    return {
      currency,
      incoming,
      outgoing,
      net: incoming - outgoing,
      opening,
      closing: opening + incoming - outgoing,
      current,
      approved,
      own,
      contributors,
      count: amounts.length,
      average: averageMinor(incoming, amounts.length),
      median: medianMinor(amounts),
      change: period.start ? changePercent(incoming, previousIncoming) : null,
      trend: buildTrend({
        start: period.start,
        end: period.end,
        transactions: rows,
        votes: raw.votes.filter((v) => ids.has(v.proposal.communityId)),
        members: joined.filter((m) => ids.has(m.communityId)),
        opening,
      }),
    };
  });
  const proposals = raw.proposals.map((p) => ({
    ...p,
    outcome: calculateOutcome(
      p.votes,
      p._count.eligibleVoters,
      p.quorumBps,
      p.thresholdBps,
      p.type === "REMOVAL",
    ),
  }));
  const decided = proposals.filter((p) =>
    ["APPROVED", "REJECTED", "EXECUTED"].includes(p.status),
  );
  const passed = decided.filter((p) => p.status !== "REJECTED");
  const eligible = proposals.reduce((s, p) => s + p._count.eligibleVoters, 0);
  const cast = proposals.reduce((s, p) => s + p.votes.length, 0);
  const personalEligible = proposals.reduce(
    (sum, p) => sum + p.eligibleVoters.length,
    0,
  );
  const personalVotes = proposals.reduce(
    (s, p) => s + p.votes.filter((v) => v.userId === userId).length,
    0,
  );
  const peers = new Map<
    string,
    {
      user: (typeof raw.members)[number]["user"];
      communities: Set<string>;
      votes: number;
      contributions: number;
    }
  >();
  for (const m of raw.members.filter(
    (m) => m.status === "ACTIVE" && m.userId !== userId,
  )) {
    const p = peers.get(m.userId) ?? {
      user: m.user,
      communities: new Set<string>(),
      votes: 0,
      contributions: 0,
    };
    p.communities.add(m.communityId);
    peers.set(m.userId, p);
  }
  for (const v of raw.votes) {
    const p = peers.get(v.userId);
    if (p) p.votes++;
  }
  for (const t of transactions.filter((t) => t.delta > 0n)) {
    const p = peers.get(t.initiatedById);
    if (p) p.contributions++;
  }
  const edges: { source: string; target: string; shared: number }[] = [];
  for (let i = 0; i < scope.selected.length; i++)
    for (let j = i + 1; j < scope.selected.length; j++) {
      const source = scope.ids[i],
        target = scope.ids[j];
      const shared = [...peers.values()].filter(
        (p) => p.communities.has(source) && p.communities.has(target),
      ).length;
      if (shared) edges.push({ source, target, shared });
    }
  const contributors = scope.selected
    .flatMap((c) => {
      const grouped = new Map<
        string,
        {
          user: (typeof raw.members)[number]["user"];
          amount: bigint;
          count: number;
        }
      >();
      for (const t of transactions.filter(
        (t) => t.communityId === c.communityId && t.delta > 0n,
      )) {
        const p = grouped.get(t.initiatedById) ?? {
          user: t.initiatedBy,
          amount: 0n,
          count: 0,
        };
        p.amount += t.delta;
        p.count++;
        grouped.set(t.initiatedById, p);
      }
      return [...grouped.values()].map((p) => ({
        ...p,
        community: c.community.name,
        slug: c.community.slug,
        currency: c.community.currency,
      }));
    })
    .sort(
      (a, b) =>
        a.currency.localeCompare(b.currency) ||
        (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0),
    );
  const pref = preferenceSchema.safeParse({ widgets: raw.preference?.widgets });
  return {
    filters,
    period,
    ...scope,
    ...raw,
    transactions,
    proposals,
    money,
    joined,
    contributors,
    peers: [...peers.values()].map((p) => ({
      ...p,
      communities: [...p.communities],
    })),
    edges,
    governance: {
      decided: decided.length,
      passed: passed.length,
      eligible,
      cast,
      approvalRate: decided.length
        ? Math.round((passed.length * 10000) / decided.length) / 100
        : null,
      turnout: eligible ? Math.round((cast * 10000) / eligible) / 100 : null,
      yes: proposals.reduce((s, p) => s + p.outcome.yes, 0),
      no: proposals.reduce((s, p) => s + p.outcome.no, 0),
      abstain: proposals.reduce((s, p) => s + p.outcome.abstain, 0),
    },
    personal: {
      eligible: personalEligible,
      votes: personalVotes,
      proposals: proposals.filter((p) => p.proposerId === userId),
      transactions: transactions.filter((t) => t.initiatedById === userId),
      voteActivity: raw.votes.filter((v) => v.userId === userId),
    },
    widgets: pref.success ? pref.data.widgets : [...dashboardWidgets],
    asOf: new Date(),
    activityTrend: buildTrend({
      start: period.start,
      end: period.end,
      transactions: [],
      votes: raw.votes,
      members: joined,
    }),
  };
}
export type AnalyticsReport = Awaited<ReturnType<typeof getAnalytics>>;
export type AnalyticsRecord = {
  id: string;
  date: Date;
  title: string;
  community: string;
  slug: string;
  person: string;
  personId: string;
  type: string;
  status: string;
  amount: bigint | null;
  currency: string;
  href: string;
};
export function reportRecords(report: AnalyticsReport) {
  const f = report.filters;
  let records: AnalyticsRecord[] = [];
  switch (f.dataset) {
    case "transactions":
      records = report.transactions.map((t) => ({
        id: t.id,
        date: t.createdAt,
        title: t.proposal?.title ?? "Member contribution",
        community: t.community.name,
        slug: t.community.slug,
        person: t.initiatedBy.displayName,
        personId: t.initiatedById,
        type: t.type,
        status: t.status,
        amount: t.amount,
        currency: t.currency,
        href: `/analytics/inspect/transactions/${t.id}`,
      }));
      break;
    case "proposals":
      records = report.proposals.map((p) => ({
        id: p.id,
        date: p.createdAt,
        title: p.title,
        community: p.community.name,
        slug: p.community.slug,
        person: p.proposer.displayName,
        personId: p.proposerId,
        type: p.type,
        status: p.status,
        amount: p.amount,
        currency: p.community.currency,
        href: `/communities/${p.community.slug}/proposals/${p.id}`,
      }));
      break;
    case "votes":
      records = (
        f.cohort === "decisions"
          ? report.proposals.flatMap((p) =>
              p.votes.map((v) => ({
                ...v,
                proposal: { id: p.id, title: p.title, community: p.community },
              })),
            )
          : report.votes
      ).map((v) => ({
        id: v.id,
        date: v.createdAt,
        title: v.proposal.title,
        community: v.proposal.community.name,
        slug: v.proposal.community.slug,
        person: v.user.displayName,
        personId: v.userId,
        type: v.choice,
        status: "RECORDED",
        amount: null,
        currency: "",
        href: `/analytics/inspect/votes/${v.id}`,
      }));
      break;
    case "members":
      records = report.members
        .filter(
          (m) =>
            (!report.period.start || m.joinedAt >= report.period.start) &&
            m.joinedAt < report.period.end,
        )
        .map((m) => ({
          id: m.id,
          date: m.joinedAt,
          title: m.user.displayName,
          community: m.community.name,
          slug: m.community.slug,
          person: m.user.displayName,
          personId: m.userId,
          type: m.community.adminId === m.userId ? "ADMINISTRATOR" : m.role,
          status: m.status,
          amount: null,
          currency: "",
          href: `/communities/${m.community.slug}/members`,
        }));
      break;
    case "activity":
      records = report.activity.map((a) => ({
        id: a.id,
        date: a.createdAt,
        title: a.action.replaceAll("_", " "),
        community: a.community.name,
        slug: a.community.slug,
        person: a.actor.displayName,
        personId: a.actorId,
        type: a.action,
        status: "RECORDED",
        amount: null,
        currency: "",
        href: `/analytics/inspect/activity/${a.id}`,
      }));
  }
  const search = f.q.toLowerCase();
  return records
    .filter(
      (r) =>
        (!search ||
          [r.id, r.title, r.community, r.person, r.type].some((v) =>
            v.toLowerCase().includes(search),
          )) &&
        (!f.status || r.status === f.status) &&
        (!f.type || r.type === f.type) &&
        (!f.person || r.personId === f.person),
    )
    .sort(
      (a, b) => b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id),
    );
}
export async function inspectAnalyticsRecord(
  userId: string,
  kind: string,
  id: string,
) {
  const scope = await analyticsScope(userId, {
    community: "all",
    range: "all",
    currency: "all",
    dataset: "transactions",
    cohort: "events",
    q: "",
    status: "",
    type: "",
    page: 1,
  });
  const { ids } = scope;
  if (kind === "transactions") {
    const record = await db.ledgerTransaction.findFirst({
      where: { id, communityId: { in: ids } },
      include: {
        community: { select: { name: true, slug: true } },
        initiatedBy: { select: identity },
        entries: { include: { account: { select: { id: true, kind: true } } } },
        proposal: { select: { title: true, id: true } },
      },
    });
    ensure(record, "Record not found in your communities.", 404);
    return { kind, record };
  }
  if (kind === "votes") {
    const record = await db.vote.findFirst({
      where: { id, proposal: { communityId: { in: ids } } },
      include: {
        user: { select: identity },
        proposal: {
          include: {
            community: { select: { name: true, slug: true } },
            votes: true,
            _count: { select: { eligibleVoters: true } },
          },
        },
      },
    });
    ensure(record, "Record not found in your communities.", 404);
    return { kind, record };
  }
  const record = await db.auditEvent.findFirst({
    where: {
      id,
      communityId: { in: ids },
      AND: [auditVisibilityForMemberships(userId, scope.selected)],
    },
    include: {
      actor: { select: identity },
      community: { select: { name: true, slug: true } },
    },
  });
  ensure(
    kind === "activity" && record,
    "Record not found in your communities.",
    404,
  );
  return { kind: "activity", record };
}
export async function saveDashboardPreference(userId: string, input: unknown) {
  const { widgets } = preferenceSchema.parse(input);
  return db.dashboardPreference.upsert({
    where: { userId },
    create: { userId, widgets },
    update: { widgets },
  });
}
export async function saveAnalyticsView(userId: string, input: unknown) {
  const data = savedViewSchema.parse(input);
  await analyticsScope(userId, data.filters);
  return atomic(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
    const existing = await tx.savedAnalyticsView.findUnique({
      where: { userId_name: { userId, name: data.name } },
    });
    ensure(
      existing ||
        (await tx.savedAnalyticsView.count({ where: { userId } })) < 20,
      "You can keep up to 20 saved views. Remove one before adding another.",
    );
    const filters = {
      ...data.filters,
      section: data.section,
      href: analyticsHref(data.section, data.filters),
    } as Prisma.InputJsonValue;
    return tx.savedAnalyticsView.upsert({
      where: { userId_name: { userId, name: data.name } },
      create: { userId, name: data.name, filters },
      update: { filters },
    });
  });
}
