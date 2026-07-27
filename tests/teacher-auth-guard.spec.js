import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import guard from "../netlify/edge-functions/teacher-auth-guard.js";

test.describe.configure({ mode: "serial" });

function ctx(nextResponse) {
  return {
    next: async () =>
      nextResponse ?? new Response("ok", { status: 200 }),
  };
}

test("teacher login remains public", async () => {
  const res = await guard(
    new Request("https://example.com/teacher/login/"),
    ctx(new Response("login", { status: 200 }))
  );

  expect(res.status).toBe(200);
  expect(await res.text()).toBe("login");
});

test("teacher admin remains delegated to admin guard", async () => {
  const res = await guard(
    new Request("https://example.com/teacher/admin/"),
    ctx(new Response("admin", { status: 200 }))
  );

  expect(res.status).toBe(200);
  expect(await res.text()).toBe("admin");
});

test("missing tc cookie redirects before Teacher Center is served", async () => {
  const res = await guard(
    new Request("https://example.com/teacher/students/"),
    ctx()
  );

  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe(
    "/teacher/login/?next=%2Fteacher%2Fstudents%2F"
  );
});

test("redirect preserves query string in next parameter", async () => {
  const res = await guard(
    new Request(
      "https://example.com/teacher/students/?student=SYNTHETIC&tab=skills"
    ),
    ctx()
  );

  expect(res.status).toBe(302);

  const location = res.headers.get("location") || "";
  expect(location).toContain("/teacher/login/?next=");
  expect(decodeURIComponent(location.split("next=")[1])).toBe(
    "/teacher/students/?student=SYNTHETIC&tab=skills"
  );
});

test("valid teacher session is verified same-origin and allowed", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url, options = {}) => {
      expect(String(url)).toBe(
        "https://example.com/.netlify/functions/teacher-session"
      );
      expect(options.method).toBe("GET");
      expect(options.headers?.cookie || "").toContain("tc=valid-session");

      return new Response(
        JSON.stringify({ ok: true, role: "teacher" }),
        { status: 200 }
      );
    };

    const res = await guard(
      new Request("https://example.com/teacher/", {
        headers: { cookie: "tc=valid-session; other=x" },
      }),
      ctx(new Response("teacher center", { status: 200 }))
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-teacher-session")).toBe(
      "teacher-session-valid"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const status of [401, 500, 503]) {
  test(`teacher-session ${status} fails closed`, async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () =>
        new Response("not authorized", { status });

      const res = await guard(
        new Request("https://example.com/teacher/review/", {
          headers: { cookie: "tc=bad-session" },
        }),
        ctx()
      );

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "/teacher/login/?next=%2Fteacher%2Freview%2F"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test("teacher-session network failure fails closed", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      throw new Error("synthetic verification failure");
    };

    const res = await guard(
      new Request("https://example.com/teacher/gradebook/", {
        headers: { cookie: "tc=unknown-session" },
      }),
      ctx()
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "/teacher/login/?next=%2Fteacher%2Fgradebook%2F"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("netlify routing protects teacher pages but excludes login and admin", () => {
  const toml = readFileSync(
    new URL("../netlify.toml", import.meta.url),
    "utf8"
  );

  expect(toml).toContain('function = "teacher-auth-guard"');
  expect(toml).toContain('path = "/teacher/*"');
  expect(toml).toContain('"/teacher/login/*"');
  expect(toml).toContain('"/teacher/admin/*"');
});
