import { z } from "zod";
import {
  V3_RULES_POLICY,
  v3FundsConfigSchema,
  weightedSelectionOutcome,
} from "./elections-core";

export const METHODS = [
  "FPTP",
  "IRV",
  "STV",
  "ELO",
  "GLICKO_2",
  "FORCED_PAIRWISE",
] as const;
export type Method = (typeof METHODS)[number];
export type MethodConfig = { selectionMethod: Method; selectionSeats: number };
export type MethodBallot =
  | { schemeId: string }
  | { ranking: string[] }
  | { pairs: { a: string; b: string; choice: "A" | "B" | "DRAW" }[] };
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function json(value: unknown): JsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}
const configSchema = z
  .object({
    selectionMethod: z.enum(METHODS),
    selectionSeats: z.number().int().min(1).max(50).default(1),
  })
  .superRefine((config, context) => {
    if (config.selectionMethod !== "STV" && config.selectionSeats !== 1)
      context.addIssue({
        code: "custom",
        path: ["selectionSeats"],
        message: "Only STV has multiple seats.",
      });
  });
export function getMethodConfig(snapshot: unknown): MethodConfig {
  return configSchema.parse(snapshot);
}
export const v4FundsConfigSchema = z
  .object({
    ...v3FundsConfigSchema.shape,
    selectionMethod: z.enum(METHODS).default("FPTP"),
    selectionSeats: z.number().int().min(1).max(50).default(1),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.maximumContribution < config.minimumContribution)
      context.addIssue({
        code: "custom",
        path: ["maximumContribution"],
        message: "Maximum must meet the minimum.",
      });
    if (config.selectionMethod !== "STV" && config.selectionSeats !== 1)
      context.addIssue({
        code: "custom",
        path: ["selectionSeats"],
        message: "Only STV has multiple seats.",
      });
    if (config.allocationPolicy === "RANKED_CUTS") {
      if (
        !config.rankedSharesBps.length ||
        config.rankedSharesBps.reduce((sum, share) => sum + share, 0) !== 10000
      )
        context.addIssue({
          code: "custom",
          path: ["rankedSharesBps"],
          message: "Ranked shares must total 100%.",
        });
    } else if (config.rankedSharesBps.length)
      context.addIssue({
        code: "custom",
        path: ["rankedSharesBps"],
        message: "Ranked shares require ranked allocation.",
      });
  });
export type V4FundsConfig = z.output<typeof v4FundsConfigSchema>;
const { selectionMethod: legacyMethod, ...fundsPolicy } = V3_RULES_POLICY;
void legacyMethod;
export const V4_RULES_POLICY = {
  ...fundsPolicy,
  rulesVersion: 4,
  methodSpec: "FUNDICATE_METHODS_V1",
  supportPolicy: "FPTP_POWER_ELSE_RANK_POINTS_V1",
} as const;

const idSchema = z.string().min(1).max(200);
const fptpSchema = z.object({ schemeId: idSchema }).strict();
const rankSchema = z
  .object({ ranking: z.array(idSchema).min(1).max(50) })
  .strict();
const pairSchema = z
  .object({
    pairs: z
      .array(
        z
          .object({
            a: idSchema,
            b: idSchema,
            choice: z.enum(["A", "B", "DRAW"]),
          })
          .strict(),
      )
      .max(1225),
  })
  .strict();
function candidates(input: readonly string[]) {
  if (
    input.length > 50 ||
    new Set(input).size !== input.length ||
    input.some((id) => !idSchema.safeParse(id).success)
  )
    throw new Error("Invalid candidate set.");
  return [...input].sort(compareId);
}
export function methodPairs(candidateIds: readonly string[]) {
  const ids = candidates(candidateIds);
  return ids.flatMap((a, index) => ids.slice(index + 1).map((b) => ({ a, b })));
}
export function validateMethodBallot(
  configInput: MethodConfig,
  candidateIds: readonly string[],
  payload: unknown,
): MethodBallot {
  const config = getMethodConfig(configInput);
  const ids = candidates(candidateIds);
  if (!ids.length) throw new Error("No candidate can receive a ballot.");
  const permitted = new Set(ids);
  if (config.selectionMethod === "FPTP") {
    const ballot = fptpSchema.parse(payload);
    if (!permitted.has(ballot.schemeId))
      throw new Error("Choose a qualified candidate.");
    return ballot;
  }
  if (config.selectionMethod === "IRV" || config.selectionMethod === "STV") {
    const ballot = rankSchema.parse(payload);
    if (
      new Set(ballot.ranking).size !== ballot.ranking.length ||
      ballot.ranking.some((id) => !permitted.has(id))
    )
      throw new Error("Rank distinct qualified candidates only.");
    return ballot;
  }
  const ballot = pairSchema.parse(payload);
  const expected = methodPairs(ids);
  if (ballot.pairs.length !== expected.length)
    throw new Error("Submit every assigned comparison exactly once.");
  const seen = new Set<string>();
  for (const pair of ballot.pairs) {
    const key = `${pair.a}\u0000${pair.b}`;
    if (
      !permitted.has(pair.a) ||
      !permitted.has(pair.b) ||
      compareId(pair.a, pair.b) >= 0 ||
      seen.has(key)
    )
      throw new Error("Invalid, reversed or duplicate comparison.");
    if (config.selectionMethod === "FORCED_PAIRWISE" && pair.choice === "DRAW")
      throw new Error("Forced choice requires a preferred candidate.");
    seen.add(key);
  }
  return {
    pairs: [...ballot.pairs].sort(
      (left, right) => compareId(left.a, right.a) || compareId(left.b, right.b),
    ),
  };
}

export type MethodVote = { userId: string; power: bigint; ballot: unknown };
type ValidVote = { userId: string; power: bigint; ballot: MethodBallot };
type Ranking = { schemeId: string; support: bigint; rank: number }[];
function rankGroups(groups: readonly string[][], supported: boolean): Ranking {
  const count = groups.reduce((sum, group) => sum + group.length, 0);
  const ranking: Ranking = [];
  for (const group of groups) {
    const rank = ranking.length + 1;
    for (const schemeId of [...group].sort(compareId))
      ranking.push({
        schemeId,
        rank,
        support: supported ? BigInt(count - rank + 1) : 0n,
      });
  }
  return ranking;
}
function groupsByBigInt(
  ids: readonly string[],
  values: ReadonlyMap<string, bigint>,
) {
  const sorted = [...ids].sort((a, b) =>
    (values.get(a) ?? 0n) === (values.get(b) ?? 0n)
      ? compareId(a, b)
      : (values.get(a) ?? 0n) > (values.get(b) ?? 0n)
        ? -1
        : 1,
  );
  const groups: string[][] = [];
  for (const id of sorted) {
    if (
      !groups.length ||
      values.get(groups[groups.length - 1][0]) !== values.get(id)
    )
      groups.push([id]);
    else groups[groups.length - 1].push(id);
  }
  return groups;
}
function irv(ids: string[], votes: ValidVote[]) {
  const continuing = new Set(ids);
  const eliminated: string[] = [];
  const rounds: JsonValue[] = [];
  let groups: string[][] = [];
  let elected: string[] = [];
  while (continuing.size) {
    const counts = new Map([...continuing].map((id) => [id, 0n]));
    let exhausted = 0n;
    for (const vote of votes) {
      const first = (vote.ballot as { ranking: string[] }).ranking.find((id) =>
        continuing.has(id),
      );
      if (first) counts.set(first, counts.get(first)! + vote.power);
      else exhausted += vote.power;
    }
    const active = [...counts.values()].reduce((sum, value) => sum + value, 0n);
    const ordered = groupsByBigInt([...continuing], counts);
    const winner = [...counts].find(
      ([, value]) => value * 2n > active && active > 0n,
    )?.[0];
    if (winner) {
      elected = [winner];
      groups = [
        [winner],
        ...groupsByBigInt(
          [...continuing].filter((id) => id !== winner),
          counts,
        ),
        ...[...eliminated].reverse().map((id) => [id]),
      ];
      rounds.push(
        json({
          counts: Object.fromEntries(counts),
          active,
          exhausted,
          majorityRequired: active / 2n + 1n,
          elected: winner,
        }),
      );
      break;
    }
    if (ordered.length <= 1 || active === 0n) {
      groups = [...ordered, ...[...eliminated].reverse().map((id) => [id])];
      rounds.push(
        json({
          counts: Object.fromEntries(counts),
          active,
          exhausted,
          majorityRequired: active / 2n + 1n,
          tied: [...continuing].sort(compareId),
        }),
      );
      break;
    }
    const tied = ordered[ordered.length - 1];
    const removed = [...tied].sort(compareId).at(-1)!;
    rounds.push(
      json({
        counts: Object.fromEntries(counts),
        active,
        exhausted,
        majorityRequired: active / 2n + 1n,
        eliminated: removed,
        eliminationTie: tied,
      }),
    );
    continuing.delete(removed);
    eliminated.push(removed);
  }
  return {
    ranking: rankGroups(groups, votes.length > 0),
    elected,
    transcript: json({ variant: "IRV_V1", rounds }),
  };
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}
class Fraction {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d = 1n) {
    if (d <= 0n) throw new Error("Invalid fraction denominator.");
    const divisor = gcd(n, d) || 1n;
    this.n = n / divisor;
    this.d = d / divisor;
  }
  add(other: Fraction) {
    return new Fraction(this.n * other.d + other.n * this.d, this.d * other.d);
  }
  sub(other: Fraction) {
    return new Fraction(this.n * other.d - other.n * this.d, this.d * other.d);
  }
  mul(other: Fraction) {
    return new Fraction(this.n * other.n, this.d * other.d);
  }
  div(other: Fraction) {
    if (other.n <= 0n)
      throw new Error("Cannot divide by nonpositive transfer basis.");
    return new Fraction(this.n * other.d, this.d * other.n);
  }
  cmp(other: Fraction) {
    const diff = this.n * other.d - other.n * this.d;
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  }
  toString() {
    return `${this.n}/${this.d}`;
  }
}
const zero = () => new Fraction(0n);
function fractionGroups(
  ids: readonly string[],
  values: ReadonlyMap<string, Fraction>,
) {
  const sorted = [...ids].sort(
    (a, b) =>
      -(values.get(a) ?? zero()).cmp(values.get(b) ?? zero()) ||
      compareId(a, b),
  );
  const groups: string[][] = [];
  for (const id of sorted) {
    if (
      !groups.length ||
      (values.get(groups[groups.length - 1][0]) ?? zero()).cmp(
        values.get(id) ?? zero(),
      )
    )
      groups.push([id]);
    else groups[groups.length - 1].push(id);
  }
  return groups;
}
function stv(ids: string[], votes: ValidVote[], publishedSeats: number) {
  const seats = Math.min(publishedSeats, ids.length);
  const initial = votes.reduce((sum, vote) => sum + vote.power, 0n);
  const quota = new Fraction(initial / BigInt(seats + 1) + 1n);
  const continuing = new Set(ids);
  const elected: string[] = [];
  const eliminated: string[] = [];
  const electionTallies = new Map<string, Fraction>();
  let retained = zero(),
    exhausted = zero();
  let parcels = votes.map((vote) => ({
    ranking: (vote.ballot as { ranking: string[] }).ranking,
    value: new Fraction(vote.power),
  }));
  const events: JsonValue[] = [];
  const route = () => {
    const counts = new Map([...continuing].map((id) => [id, zero()]));
    const routed: { ranking: string[]; value: Fraction; assigned: string }[] =
      [];
    for (const parcel of parcels) {
      const assigned = parcel.ranking.find((id) => continuing.has(id));
      if (assigned) {
        counts.set(assigned, counts.get(assigned)!.add(parcel.value));
        routed.push({ ...parcel, assigned });
      } else exhausted = exhausted.add(parcel.value);
    }
    parcels = routed.map(({ ranking, value }) => ({ ranking, value }));
    return { counts, routed };
  };
  const conservation = () => {
    const live = parcels.reduce((sum, parcel) => sum.add(parcel.value), zero());
    if (live.add(retained).add(exhausted).cmp(new Fraction(initial)))
      throw new Error("STV transfer lost voting power.");
    return {
      retained: retained.toString(),
      live: live.toString(),
      exhausted: exhausted.toString(),
      initial: `${initial}/1`,
    };
  };
  while (continuing.size && elected.length < seats) {
    const { counts, routed } = route();
    const order = fractionGroups([...continuing], counts);
    const countView = Object.fromEntries(
      [...counts].map(([id, value]) => [id, value.toString()]),
    );
    if (continuing.size <= seats - elected.length) {
      const chosen = order.flat();
      for (const id of chosen) {
        elected.push(id);
        electionTallies.set(id, counts.get(id)!);
        retained = retained.add(counts.get(id)!);
        continuing.delete(id);
      }
      parcels = [];
      events.push(
        json({
          counts: countView,
          electedWithoutQuota: chosen,
          electionTieGroups: order.filter((group) => group.length > 1),
          conservation: conservation(),
        }),
      );
      break;
    }
    const above = order.flat().filter((id) => counts.get(id)!.cmp(quota) >= 0);
    if (above.length) {
      const chosen = above[0];
      const total = counts.get(chosen)!;
      const surplus = total.sub(quota);
      const factor = surplus.div(total);
      elected.push(chosen);
      electionTallies.set(chosen, total);
      retained = retained.add(quota);
      parcels = routed
        .map((parcel) => ({
          ranking: parcel.ranking,
          value:
            parcel.assigned === chosen
              ? parcel.value.mul(factor)
              : parcel.value,
        }))
        .filter((parcel) => parcel.value.n > 0n);
      continuing.delete(chosen);
      events.push(
        json({
          counts: countView,
          elected: chosen,
          electionTie: above.filter((id) => counts.get(id)!.cmp(total) === 0),
          surplus: surplus.toString(),
          transferFactor: factor.toString(),
          conservation: conservation(),
        }),
      );
    } else {
      const tied = order.at(-1)!;
      const chosen = [...tied].sort(compareId).at(-1)!;
      continuing.delete(chosen);
      eliminated.push(chosen);
      events.push(
        json({
          counts: countView,
          eliminated: chosen,
          eliminationTie: tied,
          conservation: conservation(),
        }),
      );
    }
  }
  const final = route();
  const groups = [
    ...fractionGroups(elected, electionTallies),
    ...fractionGroups([...continuing], final.counts),
    ...[...eliminated].reverse().map((id) => [id]),
  ];
  const finalConservation = conservation();
  return {
    ranking: rankGroups(groups, votes.length > 0),
    elected,
    transcript: json({
      variant: "EXACT_INCLUSIVE_GREGORY_V1",
      publishedSeats,
      effectiveSeats: seats,
      quota: quota.toString(),
      events,
      electionTallies: Object.fromEntries(
        [...electionTallies].map(([id, value]) => [id, value.toString()]),
      ),
      finalCounts: Object.fromEntries(
        [...final.counts].map(([id, value]) => [id, value.toString()]),
      ),
      conservation: finalConservation,
    }),
  };
}

export type EloGame = { rating: number; score: number; frequency?: number };
function validGames(games: readonly EloGame[]) {
  if (
    games.some(
      (game) =>
        !Number.isFinite(game.rating) ||
        !Number.isFinite(game.score) ||
        game.score < 0 ||
        game.score > 1 ||
        !Number.isSafeInteger(game.frequency ?? 1) ||
        (game.frequency ?? 1) <= 0,
    )
  )
    throw new Error("Invalid rating game.");
}
export function eloPeriod(rating: number, games: readonly EloGame[], k = 32) {
  validGames(games);
  if (!Number.isFinite(rating) || !Number.isFinite(k) || k <= 0)
    throw new Error("Invalid Elo parameters.");
  const residual = [...games]
    .sort(
      (a, b) =>
        a.rating - b.rating ||
        a.score - b.score ||
        (a.frequency ?? 1) - (b.frequency ?? 1),
    )
    .reduce(
      (sum, game) =>
        sum +
        (game.frequency ?? 1) *
          (game.score - 1 / (1 + 10 ** ((game.rating - rating) / 400))),
      0,
    );
  const updated = rating + k * residual;
  if (!Number.isFinite(updated)) throw new Error("Nonfinite Elo result.");
  return updated;
}
export type GlickoRating = {
  rating: number;
  deviation: number;
  volatility: number;
};
export type GlickoGame = EloGame & { deviation: number };
export type GlickoParameters = {
  tau?: number;
  epsilon?: number;
  maxIterations?: number;
};
export function glicko2(
  player: GlickoRating,
  gamesInput: readonly GlickoGame[],
  parameters: GlickoParameters = {},
): GlickoRating {
  const { tau = 0.5, epsilon = 0.000001, maxIterations = 1000 } = parameters;
  validGames(gamesInput);
  if (
    !Number.isFinite(player.rating) ||
    !Number.isFinite(player.deviation) ||
    player.deviation <= 0 ||
    !Number.isFinite(player.volatility) ||
    player.volatility <= 0 ||
    !Number.isFinite(tau) ||
    tau <= 0 ||
    !Number.isFinite(epsilon) ||
    epsilon <= 0 ||
    !Number.isInteger(maxIterations) ||
    maxIterations < 1 ||
    maxIterations > 10000 ||
    gamesInput.some(
      (game) => !Number.isFinite(game.deviation) || game.deviation <= 0,
    )
  )
    throw new Error("Invalid Glicko-2 parameters.");
  const scale = 173.7178;
  const mu = (player.rating - 1500) / scale;
  const phi = player.deviation / scale;
  if (!gamesInput.length)
    return {
      ...player,
      deviation:
        scale * Math.sqrt(phi * phi + player.volatility * player.volatility),
    };
  const games = [...gamesInput].sort(
    (a, b) =>
      a.rating - b.rating ||
      a.deviation - b.deviation ||
      a.score - b.score ||
      (a.frequency ?? 1) - (b.frequency ?? 1),
  );
  let information = 0,
    residual = 0;
  for (const game of games) {
    const opponentPhi = game.deviation / scale;
    const g =
      1 / Math.sqrt(1 + (3 * opponentPhi * opponentPhi) / (Math.PI * Math.PI));
    const expected =
      1 / (1 + Math.exp(-g * (mu - (game.rating - 1500) / scale)));
    information += (game.frequency ?? 1) * g * g * expected * (1 - expected);
    residual += (game.frequency ?? 1) * g * (game.score - expected);
  }
  if (
    !Number.isFinite(information) ||
    information <= 0 ||
    !Number.isFinite(residual)
  )
    throw new Error(
      "Glicko-2 information is outside the supported numeric domain.",
    );
  const variance = 1 / information;
  const delta = variance * residual;
  const a = Math.log(player.volatility * player.volatility);
  const f = (x: number) => {
    const e = Math.exp(x);
    const denominator = phi * phi + variance + e;
    return (
      (e * (delta * delta - phi * phi - variance - e)) /
        (2 * denominator * denominator) -
      (x - a) / (tau * tau)
    );
  };
  let A = a,
    B: number;
  if (delta * delta > phi * phi + variance)
    B = Math.log(delta * delta - phi * phi - variance);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) {
      if (k >= maxIterations)
        throw new Error("Glicko-2 volatility bracketing did not converge.");
      k++;
    }
    B = a - k * tau;
  }
  let fA = f(A),
    fB = f(B),
    iterations = 0;
  while (Math.abs(B - A) > epsilon) {
    if (
      ++iterations > maxIterations ||
      !Number.isFinite(fA) ||
      !Number.isFinite(fB) ||
      fB === fA
    )
      throw new Error("Glicko-2 volatility solver did not converge.");
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const volatility = Math.exp(A / 2);
  const prePhi = Math.sqrt(phi * phi + volatility * volatility);
  const updatedPhi = 1 / Math.sqrt(1 / (prePhi * prePhi) + 1 / variance);
  const result = {
    rating: scale * (mu + updatedPhi * updatedPhi * residual) + 1500,
    deviation: scale * updatedPhi,
    volatility,
  };
  if (
    Object.values(result).some((value) => !Number.isFinite(value)) ||
    result.deviation <= 0 ||
    result.volatility <= 0
  )
    throw new Error("Nonfinite Glicko-2 result.");
  return result;
}
export const glicko2Update = glicko2;
function frequency(value: bigint) {
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Rating frequency exceeds exact safe-integer domain.");
  return Number(value);
}
function ratingGroups(ids: string[], ratings: ReadonlyMap<string, number>) {
  const units = new Map(
    ids.map((id) => [id, BigInt(Math.round(ratings.get(id)! * 1000000))]),
  );
  return groupsByBigInt(ids, units);
}
function pairwise(config: MethodConfig, ids: string[], votes: ValidVote[]) {
  const pairs = methodPairs(ids).map((pair) => ({
    ...pair,
    frequency: 0n,
    twiceA: 0n,
  }));
  for (const vote of votes) {
    const ballot = vote.ballot as Extract<MethodBallot, { pairs: unknown }>;
    ballot.pairs.forEach((pair, index) => {
      pairs[index].frequency += vote.power;
      pairs[index].twiceA +=
        vote.power *
        (pair.choice === "A" ? 2n : pair.choice === "DRAW" ? 1n : 0n);
    });
  }
  const net = new Map(ids.map((id) => [id, 0n]));
  for (const pair of pairs) {
    const margin = pair.twiceA - pair.frequency;
    net.set(pair.a, net.get(pair.a)! + margin);
    net.set(pair.b, net.get(pair.b)! - margin);
  }
  if (config.selectionMethod === "FORCED_PAIRWISE") {
    const ranking = rankGroups(groupsByBigInt(ids, net), votes.length > 0);
    return {
      ranking,
      elected: ranking
        .filter((entry) => entry.rank === 1 && entry.support > 0n)
        .map((entry) => entry.schemeId),
      transcript: json({
        variant: "FORCED_PLUS_MINUS_V1",
        assignedPairsPerVoter: pairs.length,
        submittedVoters: votes.length,
        netScores: Object.fromEntries(net),
        pairs,
      }),
    };
  }
  const games = new Map(ids.map((id) => [id, [] as GlickoGame[]]));
  for (const pair of pairs) {
    if (!pair.frequency) continue;
    const count = frequency(pair.frequency);
    const score = Number(pair.twiceA) / (2 * count);
    games
      .get(pair.a)!
      .push({ rating: 1500, deviation: 350, score, frequency: count });
    games
      .get(pair.b)!
      .push({
        rating: 1500,
        deviation: 350,
        score: 1 - score,
        frequency: count,
      });
  }
  const baseline = { rating: 1500, deviation: 350, volatility: 0.06 };
  const states = ids.map((schemeId) => ({
    schemeId,
    ...(config.selectionMethod === "ELO"
      ? { rating: eloPeriod(1500, games.get(schemeId)!) }
      : glicko2(baseline, games.get(schemeId)!)),
  }));
  const ranking = rankGroups(
    ratingGroups(
      ids,
      new Map(states.map((state) => [state.schemeId, state.rating])),
    ),
    votes.length > 0,
  );
  return {
    ranking,
    elected: ranking
      .filter((entry) => entry.rank === 1 && entry.support > 0n)
      .map((entry) => entry.schemeId),
    transcript: json({
      variant:
        config.selectionMethod === "ELO"
          ? "BATCH_ELO_V1_PAID_FREQUENCY_EXTENSION"
          : "GLICKO_2_V1_PAID_FREQUENCY_LIKELIHOOD_EXTENSION",
      ratingPeriod: 1,
      baseline,
      k: config.selectionMethod === "ELO" ? 32 : null,
      tau: config.selectionMethod === "GLICKO_2" ? 0.5 : null,
      epsilon: config.selectionMethod === "GLICKO_2" ? 0.000001 : null,
      ratingTiePrecision: 0.000001,
      assignedPairsPerVoter: pairs.length,
      submittedVoters: votes.length,
      pairs,
      states,
    }),
  };
}

export function tallyMethod(
  configInput: MethodConfig,
  candidateIds: readonly string[],
  votesInput: readonly MethodVote[],
  eligible: bigint,
  quorumBps: number,
) {
  const config = getMethodConfig(configInput);
  const ids = candidates(candidateIds);
  if (
    eligible < 0n ||
    !Number.isInteger(quorumBps) ||
    quorumBps < 1 ||
    quorumBps > 10000 ||
    votesInput.length > 10000 ||
    new Set(votesInput.map((vote) => vote.userId)).size !== votesInput.length ||
    votesInput.some((vote) => !vote.userId || vote.power <= 0n)
  )
    throw new Error("Invalid frozen method electorate or ballot identity.");
  const participation = votesInput.reduce((sum, vote) => sum + vote.power, 0n);
  if (participation > eligible)
    throw new Error("Cast power exceeds the frozen electorate.");
  const quorumRequired = (eligible * BigInt(quorumBps) + 9999n) / 10000n;
  const quorumMet =
    eligible > 0n && participation > 0n && participation >= quorumRequired;
  const votes: ValidVote[] = [...votesInput]
    .sort((a, b) => compareId(a.userId, b.userId))
    .map((vote) => ({
      ...vote,
      ballot: validateMethodBallot(config, ids, vote.ballot),
    }));
  if (config.selectionMethod === "FPTP") {
    const result = weightedSelectionOutcome(
      ids,
      votes.map((vote) => ({
        schemeId: (vote.ballot as { schemeId: string }).schemeId,
        power: vote.power,
      })),
      eligible,
      quorumBps,
    );
    return {
      ...result,
      elected: result.winnerSchemeId ? [result.winnerSchemeId] : [],
      transcript: json({
        spec: "FUNDICATE_METHODS_V1",
        config,
        candidates: ids,
        supportPolicy: "FPTP_POWER",
        counts: result.counts,
        ranking: result.ranking,
        eligible,
        participation,
        quorumRequired,
      }),
    };
  }
  const result =
    config.selectionMethod === "IRV"
      ? irv(ids, votes)
      : config.selectionMethod === "STV"
        ? stv(ids, votes, config.selectionSeats)
        : pairwise(config, ids, votes);
  const leaders = result.ranking.filter(
    (entry) => entry.rank === 1 && entry.support > 0n,
  );
  const outcome = !quorumMet
    ? "NO_QUORUM"
    : leaders.length !== 1
      ? "TIED"
      : "WINNER_SELECTED";
  return {
    outcome,
    winnerSchemeId: outcome === "WINNER_SELECTED" ? leaders[0].schemeId : null,
    eligible,
    participation,
    quorumRequired,
    counts: Object.fromEntries(
      result.ranking.map((entry) => [entry.schemeId, entry.support]),
    ),
    ranking: result.ranking,
    elected: quorumMet ? result.elected : [],
    transcript: json({
      spec: "FUNDICATE_METHODS_V1",
      config,
      candidates: ids,
      supportPolicy: "RANK_POINTS_V1",
      eligible,
      participation,
      quorumRequired,
      engine: result.transcript,
    }),
  };
}
