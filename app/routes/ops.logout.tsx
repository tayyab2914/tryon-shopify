import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { destroyOpsSession } from "../lib/ops-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return destroyOpsSession(request);
};

// Visiting /ops/logout directly (GET) just bounces to login.
export const loader = async () => redirect("/ops/login");
