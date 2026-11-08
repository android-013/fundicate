import { z } from "zod";
export const uuid = z.string().uuid();
export const money = z
  .string()
  .regex(
    /^\d{1,7}(\.\d{1,2})?$/,
    "Use a positive amount with at most two decimals.",
  )
  .transform((v) => {
    const [whole, part = ""] = v.split(".");
    return BigInt(whole) * 100n + BigInt(part.padEnd(2, "0"));
  });
const positiveMoney = money.refine(
  (v) => v > 0n,
  "Amount must be greater than zero.",
);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const registerSchema = z.strictObject({
  email: z
    .email()
    .max(200)
    .transform((v) => v.toLowerCase()),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z][a-z0-9_]{2,29}$/,
      "Use 3–30 lowercase letters, numbers or underscores.",
    ),
  displayName: text(2, 80),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
});
export const loginSchema = z.strictObject({
  email: z
    .email()
    .max(200)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const communitySchema = z
  .object({
    name: text(3, 80),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .min(3)
      .max(60),
    description: text(20, 500),
    purpose: text(10, 2000),
    currency: z.enum(["USD", "BDT", "EUR"]),
    minimumContribution: money,
    questions: text(0, 1200).default(""),
    governanceProfile: z.enum(["LEGACY", "STRICT"]).default("LEGACY"),
    founderContribution: z
      .union([money, z.literal("")])
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    founderIntroduction: text(0, 2000).default(""),
    founderAnswers: text(0, 6000).default(""),
  })
  .superRefine((value, context) => {
    if (value.governanceProfile !== "STRICT") return;
    if (value.founderContribution === undefined)
      context.addIssue({
        code: "custom",
        path: ["founderContribution"],
        message: "Declare the founder's contribution.",
      });
    else if (value.founderContribution < value.minimumContribution)
      context.addIssue({
        code: "custom",
        path: ["founderContribution"],
        message: "The founder's declaration must meet the community minimum.",
      });
    if (value.founderIntroduction.length < 20)
      context.addIssue({
        code: "custom",
        path: ["founderIntroduction"],
        message: "Introduce the founder in at least 20 characters.",
      });
    const questions = value.questions
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
    const answers = value.founderAnswers
      ? value.founderAnswers.split(/\r?\n/).map((v) => v.trim())
      : [];
    if (questions.length > 5)
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Use at most five membership questions.",
      });
    if (
      answers.length !== questions.length ||
      answers.some((v) => !v || v.length > 1000)
    )
      context.addIssue({
        code: "custom",
        path: ["founderAnswers"],
        message:
          "Answer each membership question on its matching line (1–1000 characters each).",
      });
  });
export const declarationSchema = z.object({ communityId: uuid, amount: money });
export const applicationSchema = z.object({
  communityId: uuid,
  introduction: text(20, 2000),
  proposedContribution: money,
  answers: z.record(z.string().uuid(), text(1, 1000)),
});
export const proposalSchema = z.object({
  communityId: uuid,
  title: text(5, 140),
  description: text(20, 8000),
  type: z.enum(["FUNDING", "FUNDRAISING", "REMOVAL", "GOVERNANCE"]),
  amount: money.default(0n),
  recipient: text(0, 150).default(""),
  supportingUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .max(1000)
        .refine((v) => /^https?:\/\//.test(v), "Use an HTTP or HTTPS link."),
    ])
    .default(""),
  targetUserId: z.union([uuid, z.literal("")]).default(""),
  successorId: z.union([uuid, z.literal("")]).default(""),
  quorumBps: z.coerce.number().int().min(1).max(10000),
  thresholdBps: z.coerce.number().int().min(5001).max(10000),
  opensAt: z.iso.datetime(),
  closesAt: z.iso.datetime(),
  publish: z.boolean().default(false),
  allowMemberProposals: z.boolean().optional(),
  admissionPolicy: z.enum(["VOTE", "REVIEW"]).optional(),
});
export const voteSchema = z.object({
  communityId: uuid,
  proposalId: uuid,
  choice: z.enum(["YES", "NO", "ABSTAIN"]),
});
export const proposalActionSchema = z.object({
  communityId: uuid,
  proposalId: uuid,
  action: z.enum(["open", "finalize", "execute", "cancel"]),
  reason: text(0, 500).default(""),
});
export const contributionSchema = z.object({
  communityId: uuid,
  amount: positiveMoney,
  idempotencyKey: uuid,
});
export const reviewSchema = z.object({
  communityId: uuid,
  applicationId: uuid,
  decision: z.enum(["ballot", "approve", "reject"]),
  reason: text(5, 500),
});
export const memberSchema = z.object({
  communityId: uuid,
  userId: uuid,
  action: z.enum(["moderator", "member", "transfer", "suspend", "leave"]),
  reason: text(0, 500).default(""),
  confirmName: text(0, 80).default(""),
});
export const profileSchema = z.object({
  displayName: text(2, 80),
  username: registerSchema.shape.username,
  avatarUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .max(500)
        .refine((v) => v.startsWith("https://"), "Avatar must use HTTPS."),
    ])
    .default(""),
});
