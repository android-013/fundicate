import { requireUser } from "@/lib/auth";
import { ActionForm, Field, Select, TextArea } from "@/components/forms";
import { PageHeading, Rule } from "@/components/ui";
export default async function NewCommunity() {
  await requireUser();
  return (
    <>
      <PageHeading
        eyebrow="MAKE ROOM FOR POSSIBILITY"
        title="Start your collective."
        description="Give your people a shared home, a clear purpose, and a fair way forward."
      />
      <div className="two-column form-layout">
        <section className="panel padded">
          <ActionForm operation="community" submit="Create community">
            <Field
              label="Community name"
              name="name"
              placeholder="The Campus Collective"
            />
            <Field
              label="Unique community address"
              name="slug"
              placeholder="campus-collective"
              help="Lowercase letters, numbers and hyphens."
            />
            <TextArea
              label="Short description"
              name="description"
              placeholder="In a sentence or two, what brings your community together?"
            />
            <TextArea
              label="Purpose and funding objectives"
              name="purpose"
              placeholder="What do you want to make happen together?"
            />
            <div className="form-grid">
              <Select
                label="Treasury currency"
                name="currency"
                options={[
                  { value: "USD", label: "USD · US dollar" },
                  { value: "BDT", label: "BDT · Bangladesh taka" },
                  { value: "EUR", label: "EUR · Euro" },
                ]}
              />
              <Field
                label="Minimum membership pledge"
                name="minimumContribution"
                type="number"
                defaultValue="10"
                min="0"
                max="9999999.99"
              />
            </div>
            <TextArea
              label="Membership questions (one per line, up to five)"
              name="questions"
              required={false}
              placeholder="What would you like to contribute to our community?"
            />
          </ActionForm>
        </section>
        <aside className="panel padded fit">
          <h2>A fair foundation.</h2>
          <Rule title="One community, one administrator">
            You become the initial administrator. Authority can be explicitly
            transferred to an active member.
          </Rule>
          <Rule title="Membership by majority">
            Applications go to a member vote by default, with a 50%
            participation quorum.
          </Rule>
          <Rule title="An accountable treasury">
            All funds are simulated. Every posted transaction has balanced,
            immutable ledger entries.
          </Rule>
          <Rule title="Rules that can evolve">
            Propose governance changes and let your community decide.
          </Rule>
        </aside>
      </div>
    </>
  );
}
