import { createHash } from "crypto";
import { NextRequest } from "next/server";

export function getTrustedClientIp(req: NextRequest): string | null {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return null;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
}

export function getRateLimitKey(req: NextRequest, scope: string): string {
  const ip = getTrustedClientIp(req);
  if (ip) return `${scope}:ip:${ip}`;

  const fingerprint = createHash("sha256")
    .update([
      req.headers.get("user-agent") || "",
      req.headers.get("accept-language") || "",
      req.headers.get("accept") || "",
    ].join("|"))
    .digest("hex")
    .slice(0, 24);
  return `${scope}:fp:${fingerprint || "unknown"}`;
}
