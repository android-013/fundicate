import Link from "next/link";
import { ActionForm, Field } from "@/components/forms";
export default function Login() {
  return (
    <>
      <div className="eyebrow">GOOD TO HAVE YOU BACK</div>
      <h1>Welcome to your collective.</h1>
      <p className="muted">
        Sign in to see what your community is making happen.
      </p>
      <ActionForm operation="login" submit="Sign in">
        <Field
          label="Email address"
          name="email"
          type="email"
          placeholder="you@example.com"
        />
        <Field label="Password" name="password" type="password" />
      </ActionForm>
      <p className="auth-switch">
        New here?{" "}
        <Link href="/register">
          Create an account <span>↗</span>
        </Link>
      </p>
      <details className="demo-credentials">
        <summary>Try the local demo</summary>
        <p>
          Administrator: <code>amara@fundicate.demo</code>
          <br />
          Moderator: <code>sami@fundicate.demo</code>
          <br />
          Member: <code>jules@fundicate.demo</code>
          <br />
          Password: <code>FundicateDemo!2026</code>
        </p>
        <small>
          These fictional accounts exist only after the development seed runs.
        </small>
      </details>
    </>
  );
}
