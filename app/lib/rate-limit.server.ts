import { createHash } from "node:crypto";
import db from "../db.server";

// Per-shopper (per-IP) try-on rate limiting.
// Each shop sets how many try-ons one individual may generate within a
// window (daily or monthly). Shoppers are identified by a salted hash of
// their IP — the raw IP is never stored or logged.

export type LimitPeriod = "DAILY" | "MONTHLY";

export function hashIp(ip: string): string {
  const salt = process.env.SHOP_IP_SALT ?? "tryon";
  return createHash("sha256").update(`${ip}::${salt}`).digest("hex");
}

/**
 * Best-effort client IP from proxy headers (Vercel/Fly set `x-forwarded-for`).
 * Returns null when it can't be determined — callers treat that as "can't
 * enforce a limit" rather than blocking a legitimate shopper.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

export function ipHashFromHeaders(headers: Headers): string | null {
  const ip = clientIp(headers);
  return ip ? hashIp(ip) : null;
}

function periodStart(period: LimitPeriod): Date {
  const now = new Date();
  if (period === "MONTHLY") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export interface LimitConfig {
  enabled: boolean;
  perIp: number;
  period: LimitPeriod;
}

export interface LimitCheck {
  allowed: boolean;
  used: number;
  limit: number;
  period: LimitPeriod;
}

export function periodLabel(period: LimitPeriod): string {
  return period === "MONTHLY" ? "this month" : "today";
}

export async function checkIpLimit(
  shopId: string,
  ipHash: string | null,
  config: LimitConfig,
): Promise<LimitCheck> {
  const limit = Math.max(0, config.perIp);
  if (!config.enabled || ipHash === null) {
    return { allowed: true, used: 0, limit, period: config.period };
  }
  const used = await db.tryOn.count({
    where: {
      shopId,
      ipHash,
      status: "COMPLETED",
      createdAt: { gte: periodStart(config.period) },
    },
  });
  return { allowed: used < limit, used, limit, period: config.period };
}
