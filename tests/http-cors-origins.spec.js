/* eslint-env node */
import { describe, it, expect, afterEach } from "vitest";
import http from "../netlify/functions/_lib/http.js";

const { isOriginAllowed } = http;

function mkEvent({ origin, host = "deploy-preview-123--site.netlify.app", proto = "https" } = {}) {
  return { headers: { origin, host, "x-forwarded-proto": proto } };
}

describe("http helpers: CORS origin hardening", () => {
  const savedURL = process.env.URL;

  afterEach(() => {
    process.env.URL = savedURL;
  });

  it("allows local dev origins", () => {
    expect(
      isOriginAllowed(
        "http://localhost:8888",
        mkEvent({ origin: "http://localhost:8888", host: "localhost:8888", proto: "http" })
      )
    ).toBe(true);
  });

  it("allows same-origin derived from request host/proto", () => {
    const o = "https://deploy-preview-123--site.netlify.app";
    expect(isOriginAllowed(o, mkEvent({ origin: o, host: "deploy-preview-123--site.netlify.app" }))).toBe(true);
  });

  it("allows env URL origin and www/apex sibling for custom domains", () => {
    process.env.URL = "https://reinischclassroom.com";
    expect(
      isOriginAllowed(
        "https://www.reinischclassroom.com",
        mkEvent({ origin: "https://www.reinischclassroom.com", host: "reinischclassroom.com" })
      )
    ).toBe(true);
  });

  it("rejects random third-party origins", () => {
    expect(isOriginAllowed("https://evil.example", mkEvent({ origin: "https://evil.example" }))).toBe(false);
  });

  it("rejects other netlify.app origins when not same-origin", () => {
    expect(
      isOriginAllowed(
        "https://someone-else.netlify.app",
        mkEvent({ origin: "https://someone-else.netlify.app", host: "deploy-preview-123--site.netlify.app" })
      )
    ).toBe(false);
  });
});
