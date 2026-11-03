import Link from "next/link";
import { ActionForm, Field } from "@/components/forms";
export default function Register() {
  return (
    <>
      <div className="eyebrow">YOUR PEOPLE. YOUR POSSIBILITIES.</div>
      <h1>Start with a shared purpose.</h1>
      <p className="muted">
        Create an account and find a community to grow with.
      </p>
      <ActionForm operation="register" submit="Create your account">
        <Field
          label="Display name"
          name="displayName"
          placeholder="Your name"
        />
        <Field label="Username" name="username" placeholder="your_username" />
        <Field
          label="Email address"
          name="email"
          type="email"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          help="At least 12 characters. Use a unique password."
        />
      </ActionForm>
      <p className="auth-switch">
        Already part of the collective? <Link href="/login">Sign in ↗</Link>
      </p>
    </>
  );
}
