import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("JWT iss/aud", () => {
  beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-secret"));

  it("签发的 token 带 iss/aud 且能验签通过", async () => {
    const { signSession, verifySession } = await import("./session");
    const token = await signSession({
      sub: "u1", email: "a@b.c", name: "T", tenantId: "t1", tenantName: "T", role: "admin",
    });
    const payload = await verifySession(token);
    expect(payload?.sub).toBe("u1");
  });
  it("无 iss/aud 的旧 token 验签失败", async () => {
    const { SignJWT } = await import("jose");
    const legacy = await new SignJWT({ email: "a@b.c", name: "T", tenantId: "t1", tenantName: "T", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("test-secret"));
    const { verifySession } = await import("./session");
    expect(await verifySession(legacy)).toBeNull();
  });
  it("iss 不匹配的 token 验签失败", async () => {
    const { SignJWT } = await import("jose");
    const foreign = await new SignJWT({ email: "a@b.c", name: "T", tenantId: "t1", tenantName: "T", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer("other-app")
      .setAudience("kqa")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("test-secret"));
    const { verifySession } = await import("./session");
    expect(await verifySession(foreign)).toBeNull();
  });
});
