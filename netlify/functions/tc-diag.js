const crypto = require("crypto");

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  });
  return out;
}

function b64uToJson(b64u) {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64u.length + 3) % 4);
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

function decodeJwtNoVerify(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    return b64uToJson(parts[1]);
  } catch {
    return null;
  }
}

function fp(secret) {
  if (!secret) return null;
  return crypto.createHash("sha256").update(String(secret)).digest("hex").slice(0, 10);
}

function hmacB64Url(secret, data) {
  return crypto
    .createHmac("sha256", String(secret))
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sigMatch(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = hmacB64Url(secret, data);
  return expected === parts[2];
}

exports.handler = async (event) => {
  const now = Math.floor(Date.now() / 1000);
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie || "";
  const cookies = parseCookies(cookieHeader);

  const tc = cookies.tc || null;
  const decoded = tc ? decodeJwtNoVerify(tc) : null;

  const decodedLooksExpired =
    decoded && typeof decoded.exp === "number" ? decoded.exp <= now : null;

  let verified = false;
  let verifyReason = null;

  let auth = null;
  try {
    auth = require("./_lib/auth.js");
  } catch {
    auth = null;
  }

  if (!tc) {
    verifyReason = "auth.verify_missing_or_no_tc";
  } else if (auth && typeof auth.verify === "function") {
    try {
      const payload = auth.verify(tc);
      verified = !!payload;
      verifyReason = verified ? "ok" : "verify_returned_null";
    } catch (e) {
      verifyReason = `verify_threw:${e?.message || "unknown"}`;
    }
  } else {
    verifyReason = "auth.verify_unavailable";
  }

  const keys = [
    "RC_TC_SECRET",
    "TC_SECRET",
    "RC_AUTH_SECRET",
    "RC_JWT_SECRET",
    "JWT_SECRET",
    "SESSION_SECRET",
    "RC_SECRET",
  ];

  const secret = {
    present: {},
    fingerprints: {},
    sigMatchesTc: {},
  };

  for (const k of keys) {
    const v = process.env[k];
    secret.present[k] = !!v;
    secret.fingerprints[k] = fp(v);
    secret.sigMatchesTc[k] = tc && v ? sigMatch(tc, v) : null;
  }

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(
      {
        now,
        cookieHeaderBytes: Buffer.byteLength(cookieHeader || "", "utf8"),
        tcCount: (cookieHeader.match(/(?:^|;\s*)tc=/g) || []).length,
        usingTokenFrom: tc ? "tc" : null,
        decoded,
        decodedLooksExpired,
        verified,
        verifyReason,
        secret,
      },
      null,
      2
    ),
  };
};
