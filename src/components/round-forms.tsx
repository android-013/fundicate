"use client";
import { useState } from "react";
import { ActionForm, Field, Select, TextArea } from "./forms";

export function FundingRoundForm({
  communityId,
  currency,
}: {
  communityId: string;
  currency: string;
}) {
  const [funded, setFunded] = useState(false);
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
            ? "V2 funded round · actual local deposits are held separately from the community treasury. The winner’s request caps its allocation; any unused amount returns to contributors."
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
              lock when submissions open. Only active members can deposit;
              voting stays one member, one vote.
            </p>
          </div>
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
            help="Between 3 and 90 days after the submission deadline. Original contributors can recover unresolved funds after expiry."
          />
          <p className="notice">
            Winner takes the available allocation, capped at the scheme’s
            request. Unused funds return proportionally to their original
            contributors. A tie, missed quorum, no qualified winner, or a missed
            target returns the whole pool. No fees are charged. Veto is disabled
            for this version: settlement can be prepared immediately after the
            final decision.
          </p>
        </section>
      )}
      <Select
        name="quorumBps"
        label="Participation required in each vote"
        defaultValue="5000"
        options={[
          { value: "2500", label: "25% of eligible members" },
          { value: "5000", label: "50% of eligible members" },
          { value: "7500", label: "75% of eligible members" },
          { value: "10000", label: "All eligible members" },
        ]}
      />
      <p className="notice">
        Each scheme needs more than 50% YES among YES/NO ballots, plus quorum.
        Screening and selection each last 24 hours. Every eligible member has
        one vote per scheme in screening and one choice in selection. Results
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
          " The winner’s requested amount caps its allocation; any unused pool is refunded to its original contributors."}
      </p>
    </ActionForm>
  );
}
