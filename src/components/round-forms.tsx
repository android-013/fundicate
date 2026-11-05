"use client";
import { useState } from "react";
import { ActionForm, Field, Select, TextArea } from "./forms";

export function FundingRoundForm({ communityId }: { communityId: string }) {
  const [deadline] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
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
          {
            value: "EVERYONE",
            label: "Everyone with an account, including non-members",
          },
        ]}
      />
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
}: {
  communityId: string;
  roundId: string;
  currency: string;
}) {
  return (
    <ActionForm
      operation="round-scheme"
      defaults={{ communityId, roundId }}
      submit="Submit scheme"
    >
      <Field name="title" label="Scheme title" />
      <TextArea name="description" label="Your plan and expected impact" />
      <div className="form-row">
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
      </p>
    </ActionForm>
  );
}
