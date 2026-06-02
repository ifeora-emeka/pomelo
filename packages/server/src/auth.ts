import crypto from "node:crypto";

export function signToken(payload: any, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  const signature = hmac.digest("base64url");
  return `${data}.${signature}`;
}

export function verifyToken(token: string, secret: string): any | null {
  const parts = token.split(".");
  const data = parts[0];
  const signature = parts[1];
  if (!data || !signature) return null;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  const expectedSignature = hmac.digest("base64url");

  const signatureBuf = Buffer.from(signature, "base64url");
  const expectedSignatureBuf = Buffer.from(expectedSignature, "base64url");

  if (signatureBuf.length !== expectedSignatureBuf.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(signatureBuf, expectedSignatureBuf)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
