export type TreasurySubmission = {
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  recipient: string;
};
export type TreasuryResult = {
  status: "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED";
  simulated: boolean;
  network: string;
  accountId: string | null;
  transactionHash: string | null;
  confirmedAt: Date | null;
};
export interface TreasuryAdapter {
  submit(input: TreasurySubmission): Promise<TreasuryResult>;
  reconcile(reference: string): Promise<TreasuryResult>;
}
export class SimulatedTreasuryAdapter implements TreasuryAdapter {
  async submit(_input: TreasurySubmission): Promise<TreasuryResult> {
    void _input;
    return {
      status: "CONFIRMED",
      simulated: true,
      network: "local-simulation",
      accountId: null,
      transactionHash: null,
      confirmedAt: new Date(),
    };
  }
  async reconcile(_reference: string): Promise<TreasuryResult> {
    throw new Error(
      `Simulation has no external transaction to reconcile: ${_reference}`,
    );
  }
}
export const treasuryAdapter: TreasuryAdapter = new SimulatedTreasuryAdapter();
