"use client";
import { useId, useState } from "react";
import { ActionForm, Field, Select, TextArea } from "./forms";

export function FundingRoundForm({
  communityId,
  currency,
}: {
  communityId: string;
  currency: string;
}) {
  const [funded, setFunded] = useState(false);
  const [fundedVersion, setFundedVersion] = useState("V3");
  const [allocation, setAllocation] = useState("WINNER_ALL");
  const [vetoEnabled, setVetoEnabled] = useState(true);
  const versionLabelId = useId();
  const allocationLabelId = useId();
  const advanced = funded && fundedVersion === "V3";
  const [deadline] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [expiry] = useState(() => {
    const d = new Date(Date.now() + 14 * 86400000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  return (
    <ActionForm
      operation="funding-round"
      defaults={{ communityId }}
      submit="Create draft round"
    >
      <Field
        name="title"
        label="Round title"
        placeholder="What should we build together?"
      />
      <TextArea
        name="description"
        label="Purpose and submission requirements"
        placeholder="Explain the goal and what a good scheme should include."
      />
      <div className="inset round-funding-choice">
        <label className="checkbox">
          <input
            name="funded"
            type="checkbox"
            checked={funded}
            onChange={(e) => setFunded(e.target.checked)}
          />
          Collect a dedicated funding pool for this round
        </label>
        <p className="muted small-text">
          {funded
            ? "A separate local funding pool · choose the published voting, allocation and rejection rules before collecting deposits. Unused principal returns to original contributors."
            : "V1 decision-only round · the community selects a scheme without collecting, reserving, or paying funds. Existing decision-only rounds retain this behavior."}
        </p>
      </div>
      <Field
        name="submissionsCloseAt"
        label="Submission deadline"
        type="datetime-local"
        defaultValue={deadline}
        help="Your local time. Screening begins after this deadline."
      />
      <Select
        name="proposalPolicy"
        label="Who can submit schemes?"
        options={[
          { value: "MEMBERS", label: "Active community members" },
          { value: "STAFF", label: "Administrator and active moderators" },
          {
            value: "EVERYONE",
            label: "Everyone with an account, including non-members",
          },
        ]}
      />
      {funded && (
        <section className="inset round-funded-config">
          <div>
            <span className="eyebrow">A SEPARATE ROUND POOL</span>
            <h3>Publish the funding rules.</h3>
            <p className="muted small-text">
              {currency} · local simulation · two decimal places. These rules
              are fixed at creation. Only active members can deposit. A pledge
              never counts as received money or paid voting power.
            </p>
          </div>
          <label className="field">
            <span id={versionLabelId}>Funded rules version</span>
            <select
              name="fundedVersion"
              value={fundedVersion}
              aria-labelledby={versionLabelId}
              onChange={(event) => setFundedVersion(event.target.value)}
            >
              <option value="V3">
                V3 · stage weights, allocation policies and optional veto
              </option>
              <option value="V2">
                V2 · equal votes, winner-all, veto disabled
              </option>
            </select>
          </label>
          <Field
            name="fundingTarget"
            label={`Minimum funding target (${currency})`}
            type="number"
            min="0.01"
            max="9999999.99"
            defaultValue="1000"
            help="If the received pool misses this target, every deposit is refunded."
          />
          <div className="form-grid">
            <Field
              name="minimumContribution"
              label={`Initial contribution minimum (${currency})`}
              type="number"
              min="0.01"
              max="9999999.99"
              defaultValue="10"
            />
            <Field
              name="maximumContribution"
              label={`Total per contributor maximum (${currency})`}
              type="number"
              min="0.01"
              max="9999999.99"
              defaultValue="500"
            />
          </div>
          <p className="muted small-text">
            The first deposit must meet the minimum. Positive top-ups are
            allowed while your cumulative deposits stay at or below the maximum.
          </p>
          <Field
            name="collectionClosesAt"
            label="Contribution cutoff (your local time)"
            type="datetime-local"
            defaultValue={deadline}
            help="Must be no later than the submission deadline. The received contribution basis freezes when collection closes."
          />
          <Field
            name="expiresAt"
            label="Unresolved funding expiry (your local time)"
            type="datetime-local"
            defaultValue={expiry}
            help={
              advanced
                ? "Between 3 and 90 days after submissions. Recovery of an unresolved pool respects any published veto window; an existing queued plan resumes unchanged."
                : "Between 3 and 90 days after the submission deadline. Original contributors can recover unresolved funds after expiry."
            }
          />
          {advanced ? (
            <>
              <div className="v3-form-rule-grid">
                {[
                  { name: "screeningWeight", label: "Screening voting power" },
                  { name: "selectionWeight", label: "Selection voting power" },
                  { name: "vetoWeight", label: "Rejection veto voting power" },
                ].map((stage) => (
                  <Select
                    key={stage.name}
                    name={stage.name}
                    label={stage.label}
                    options={[
                      {
                        value: "EQUAL",
                        label: "Equal · one unit per eligible member",
                      },
                      {
                        value: "CONTRIBUTION",
                        label: "Paid contribution · received minor units",
                      },
                    ]}
                  />
                ))}
              </div>
              <p className="muted small-text">
                Active membership and actual received contributions at the
                cutoff determine frozen power. Later membership or role changes
                do not rewrite it. A stage with no positive eligible power
                cannot open.
              </p>
              <label className="field">
                <span id={allocationLabelId}>Allocation policy</span>
                <select
                  name="allocationPolicy"
                  value={allocation}
                  aria-labelledby={allocationLabelId}
                  onChange={(event) => setAllocation(event.target.value)}
                >
                  <option value="WINNER_ALL">
                    Winner-all · a unique top scheme
                  </option>
                  <option value="PROPORTIONAL">
                    Proportional · share by positive support
                  </option>
                  <option value="RANKED_CUTS">
                    Ranked cuts · published shares by position
                  </option>
                </select>
              </label>
              {allocation === "RANKED_CUTS" && (
                <Field
                  name="rankedSharesBps"
                  label="Ranked shares (%)"
                  defaultValue="60, 30, 10"
                  help="Positive percentages in rank order, separated by commas. Up to 50 shares and two decimal places each; total exactly 100%."
                />
              )}
              <p className="notice">
                {allocation === "WINNER_ALL"
                  ? "A unique top scheme receives the smaller of the pool and its request. A top tie returns the entire pool."
                  : allocation === "PROPORTIONAL"
                    ? "Positive-support schemes receive proportional shares before request caps. Equal support is allowed. Exact rounding ties use scheme ID; unused caps and unpayable shares are refunded."
                    : "Shares belong to rank positions. Tied groups consume their positions and those shares are refunded. Missing positions, request caps and unpayable shares are refunded, with no shifting or redistribution."}
              </p>
              <label className="checkbox">
                <input
                  name="vetoEnabled"
                  type="checkbox"
                  checked={vetoEnabled}
                  onChange={(event) => setVetoEnabled(event.target.checked)}
                />
                Enable a 24-hour rejection veto
              </label>
              <p className="notice">
                {vetoEnabled
                  ? "The result and proposed allocation are published first. Every payout waits the full 24 hours, even if everyone votes early. Rejection needs at least 90% of all frozen veto power, including nonvoters in the denominator. A rejected round refunds original contributors."
                  : "Veto is disabled. Settlement may be prepared after the final decision without an additional rejection window."}
              </p>
              <p className="muted small-text">
                Unused principal always returns pro rata to original payment
                sources, using largest remainders and source-ID ties. Fees are
                zero. Unknown local execution outcomes must be reconciled before
                retry or release.
              </p>
            </>
          ) : (
            <p className="notice">
              Winner takes the available allocation, capped at the scheme’s
              request. Unused funds return proportionally to their original
              contributors. A tie, missed quorum, no qualified winner, or a
              missed target returns the whole pool. No fees are charged. Veto is
              disabled for this version: settlement can be prepared immediately
              after the final decision.
            </p>
          )}
        </section>
      )}
      <Select
        name="quorumBps"
        label={
          advanced
            ? "Screening and selection participation required"
            : "Participation required in each vote"
        }
        defaultValue="5000"
        options={[
          {
            value: "2500",
            label: advanced
              ? "25% of frozen stage power"
              : "25% of eligible members",
          },
          {
            value: "5000",
            label: advanced
              ? "50% of frozen stage power"
              : "50% of eligible members",
          },
          {
            value: "7500",
            label: advanced
              ? "75% of frozen stage power"
              : "75% of eligible members",
          },
          {
            value: "10000",
            label: advanced ? "All frozen stage power" : "All eligible members",
          },
        ]}
      />
      <p className="notice">
        {advanced
          ? "Screening needs strictly more YES than NO power, plus rounded-up quorum. Abstentions count toward screening participation, never approval. Selection is FPTP with one scheme choice, no abstention ballot, and stage-specific power. "
          : "Each scheme needs more than 50% YES among YES/NO ballots, plus quorum. "}
        Screening and selection each last 24 hours.{" "}
        {advanced
          ? "Each eligible positive-power voter has"
          : "Every eligible member has"}
        one ballot per scheme in screening and one choice in selection. Results
        stay sealed until their stage closes.
      </p>
    </ActionForm>
  );
}

export function FundingSchemeForm({
  communityId,
  roundId,
  currency,
  funded = false,
}: {
  communityId: string;
  roundId: string;
  currency: string;
  funded?: boolean;
}) {
  return (
    <ActionForm
      operation="round-scheme"
      defaults={{ communityId, roundId }}
      submit="Submit scheme"
    >
      <Field name="title" label="Scheme title" />
      <TextArea name="description" label="Your plan and expected impact" />
      <Select
        name="category"
        label="Funding request category"
        options={[
          ...(!funded
            ? [
                {
                  value: "UNSPECIFIED",
                  label: "Not specified · decision-only scheme",
                },
              ]
            : []),
          { value: "DONATION", label: "Donation" },
          { value: "CROWDFUNDING", label: "Crowdfunding" },
          { value: "INVESTMENT_REQUEST", label: "Investment request" },
        ]}
      />
      <div className="form-grid">
        <Field
          name="amount"
          label={`Requested amount (${currency})`}
          type="number"
          min="0.01"
          max="9999999.99"
        />
        <Field
          name="recipient"
          label="Recipient or project name"
          help="A label for the funding request."
        />
      </div>
      <Field
        name="supportingUrl"
        label="Supporting link"
        type="url"
        required={false}
      />
      <p className="muted small-text">
        Submitted schemes are final. Up to five schemes per account and 50 per
        round. Submitting does not move or reserve funds.
        {funded &&
          " Each scheme’s requested amount caps its allocation; any unused pool is refunded to its original contributors."}
      </p>
    </ActionForm>
  );
}
