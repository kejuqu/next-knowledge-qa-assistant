import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { SESSION_AUDIENCE, SESSION_ISSUER, signSession } from "@kqa/auth/session";
import { config, proxy } from "../../../apps/web/src/proxy";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

let token: string;
let expired: string;
beforeAll(async () => {
  process.env.AUTH_SECRET = "proxy-test-secret";
  token = await signSession({ sub: "u1", email: "a@b.c", name: "T", tenantId: "t1", tenantName: "T", role: "member" });
  expired = await new SignJWT({ tenantId: "t1" }).setProtectedHeader({ alg: "HS256" })
    .setSubject("u1").setIssuer(SESSION_ISSUER).setAudience(SESSION_AUDIENCE)
    .setExpirationTime(0).sign(new TextEncoder().encode(process.env.AUTH_SECRET));
});

function request(path: string, cookie?: string) {
  return new NextRequest(`http://app.lvh.me:6101${path}`, { headers: cookie ? { cookie } : {} });
}

describe("JWT proxy", () => {
  it.each(["/signin", "/signup", "/api/signin", "/api/signup", "/api/signout"])("allows anonymous auth routes: %s", async (path) => {
    expect((await proxy(request(path))).headers.get("x-middleware-next")).toBe("1");
  });
  it.each(["/api/signin/admin", "/api/signup-extra"])("does not expose similar API paths: %s", async (path) => {
    expect((await proxy(request(path))).status).toBe(401);
  });
  it("redirects anonymous page requests to auth", async () => {
    const response = await proxy(request("/chat"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/signin");
  });
  it.each([undefined, "kqa_session=forged"])("returns JSON 401 for unauthenticated API requests: %s", async (cookie) => {
    const response = await proxy(request("/api/documents/a/retry", cookie));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
  it("仅员工导入 POST 的 Bearer 请求交由路由鉴权", async () => {
    const bearer = { authorization: "Bearer invalid" };
    const allowed = await proxy(new NextRequest("http://app.lvh.me:6101/api/team/import", { method: "POST", headers: bearer }));
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
    for (const path of ["/api/team/api-keys", "/api/team", "/api/documents", "/api/team/import/template"]) {
      expect((await proxy(new NextRequest(`http://app.lvh.me:6101${path}`, { method: "POST", headers: bearer }))).status).toBe(401);
    }
    expect((await proxy(new NextRequest("http://app.lvh.me:6101/api/team/import", { headers: bearer }))).status).toBe(401);
    expect((await proxy(new NextRequest("http://app.lvh.me:6101/api/team/import", { method: "POST" }))).status).toBe(401);
  });
  it("rejects expired JWTs", async () => {
    expect((await proxy(request("/api/conversations", `kqa_session=${expired}`))).status).toBe(401);
  });
  it("passes valid sessions through", async () => {
    expect((await proxy(request("/api/conversations", `kqa_session=${token}`))).headers.get("x-middleware-next")).toBe("1");
  });
  it("rejects duplicate valid cookies even when RequestCookies merges them", async () => {
    expect((await proxy(request("/api/conversations", `kqa_session=${token}; kqa_session=${token}`))).status).toBe(401);
  });
  it("accepts one valid cookie alongside a forged cookie", async () => {
    expect((await proxy(request("/chat", `kqa_session=forged; kqa_session=${token}`))).headers.get("x-middleware-next")).toBe("1");
  });
  it.each(["/chat", "/documents", "/settings", "/api/conversations", "/api/documents/file.pdf/retry"])("protects %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });
  it.each(["/_next/static/chunk.js", "/_next/hmr", "/__nextjs_font/geist.woff2", "/icon.png", "/favicon.ico"])("excludes public resources: %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });
});
