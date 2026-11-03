export type Ballot = { choice: "YES" | "NO" | "ABSTAIN" };
export function calculateOutcome(
  votes: Ballot[],
  eligible: number,
  quorumBps: number,
  thresholdBps: number,
  removal = false,
) {
  if (
    !Number.isInteger(eligible) ||
    eligible < votes.length ||
    eligible < 0 ||
    !Number.isInteger(quorumBps) ||
    quorumBps < 1 ||
    quorumBps > 10000 ||
    !Number.isInteger(thresholdBps) ||
    thresholdBps < 5001 ||
    thresholdBps > 10000
  )
    throw new Error("Invalid ballot configuration");
  const yes = votes.filter((v) => v.choice === "YES").length;
  const no = votes.filter((v) => v.choice === "NO").length;
  const abstain = votes.filter((v) => v.choice === "ABSTAIN").length;
  if (yes + no + abstain !== votes.length)
    throw new Error("Invalid ballot choice");
  const quorumRequired = Math.ceil((eligible * quorumBps) / 10000);
  const quorumMet = eligible > 0 && votes.length >= quorumRequired;
  const valid = yes + no;
  const thresholdMet =
    valid > 0 &&
    (removal
      ? yes * 3 >= valid * 2
      : thresholdBps === 5001
        ? yes * 2 > valid
        : yes * 10000 >= valid * thresholdBps);
  return {
    yes,
    no,
    abstain,
    valid,
    participation: votes.length,
    eligible,
    quorumRequired,
    quorumMet,
    thresholdMet,
    approved: quorumMet && thresholdMet,
  };
}
