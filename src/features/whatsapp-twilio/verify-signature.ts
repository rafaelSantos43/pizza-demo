import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getTwilioEnv } from "./env";

// https://www.twilio.com/docs/usage/webhooks/webhooks-security
// expectedSig = base64( HMAC-SHA1( authToken, fullUrl + concat(sortedKeys, k+v) ) )
export function verifyTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  receivedSignature: string | null,
): boolean {
  if (!receivedSignature) return false;

  const env = getTwilioEnv();
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce(
    (acc, k) => acc + k + params[k],
    fullUrl,
  );

  const expected = createHmac("sha1", env.authToken)
    .update(Buffer.from(data, "utf8"))
    .digest("base64");

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(receivedSignature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
