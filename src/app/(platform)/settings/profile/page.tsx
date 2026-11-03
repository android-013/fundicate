import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ActionForm, Field } from "@/components/forms";
import { Avatar, PageHeading } from "@/components/ui";
export default async function Profile() {
  const user = await requireUser();
  return (
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your profile."
        description="How your community gets to know you."
      />
      <div className="settings-nav">
        <Link href="/settings/profile" className="selected">
          Profile
        </Link>
        <Link href="/settings/security">Security</Link>
      </div>
      <section className="panel padded narrow">
        <div className="row profile-preview">
          <Avatar name={user.displayName} url={user.avatarUrl} />
          <div>
            <h2>{user.displayName}</h2>
            <p className="muted">{user.email}</p>
          </div>
        </div>
        <ActionForm operation="profile" submit="Save profile">
          <Field
            name="displayName"
            label="Display name"
            defaultValue={user.displayName}
          />
          <Field
            name="username"
            label="Username"
            defaultValue={user.username}
          />
          <Field
            name="avatarUrl"
            label="Avatar URL (optional)"
            type="url"
            required={false}
            defaultValue={user.avatarUrl ?? ""}
            help="Paste an HTTPS image URL. Your initials appear if the image cannot load."
          />
        </ActionForm>
      </section>
    </>
  );
}
