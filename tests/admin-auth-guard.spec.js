import { test, expect } from "@playwright/test";
import guard from "../netlify/edge-functions/admin-auth-guard.js";

function ctx(nextResponse) {
  return {
    next: async () => nextResponse ?? new Response("ok", { status: 200 }),
  };
}

test("Unauth /admin/ redirects to admin-login with reason (not /hub)", async () => {
  const res = await guard(new Request("https://example.com/admin/"), ctx());
  expect(res.status).toBe(302);
  const loc = res.headers.get("location") || "";
  expect(loc).toContain("/admin-login/?reason=missing_admin_session");
  expect(loc).not.toContain("/hub");
});

test("Auth /admin/ calls teacher-session same-origin, forwards cookies, allows + sets X-Admin-Session", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (u, opts = {}) => {
      expect(String(u)).toContain("https://example.com/.netlify/functions/teacher-session");
      expect(opts.headers?.cookie || "").toContain("tc=abc123");
      return new Response("ok", { status: 200 });
    };

    const res = await guard(
      new Request("https://example.com/admin/", { headers: { cookie: "tc=abc123; other=x" } }),
      ctx(new Response("admin ok", { status: 200 }))
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-admin-session")).toBe("teacher-session-valid");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Non-200 from teacher-session redirects to admin-login", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => new Response("nope", { status: 401 });

    const res = await guard(
      new Request("https://example.com/admin/", { headers: { cookie: "tc=bad" } }),
      ctx()
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location") || "").toContain("/admin-login/?reason=missing_admin_session");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
