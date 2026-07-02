import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";

import {
  commitOpsLogin,
  getOpsAuthState,
  opsPasswordConfigured,
  verifyOpsPassword,
} from "../lib/ops-auth.server";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Already logged in? Go straight to the dashboard.
  if (await getOpsAuthState(request)) throw redirect("/ops");
  return { configured: opsPasswordConfigured() };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const password = form.get("password");
  if (!verifyOpsPassword(typeof password === "string" ? password : null)) {
    return { error: opsPasswordConfigured() ? "Incorrect password." : "OPS_PASSWORD is not set on the server." };
  }
  return commitOpsLogin(request, "/ops");
};

export default function OpsLogin() {
  const { configured } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="ops-login">
      <h1>Ops dashboard</h1>
      <p>Internal monitoring — team access only.</p>
      {actionData?.error && <div className="ops-error">{actionData.error}</div>}
      {!configured && (
        <div className="ops-error">
          Set <code>OPS_PASSWORD</code> in <code>.env.ops</code> to enable login.
        </div>
      )}
      <Form method="post">
        <input
          className="ops-field"
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
        />
        <button type="submit" className="ops-btn">
          Enter
        </button>
      </Form>
    </div>
  );
}
