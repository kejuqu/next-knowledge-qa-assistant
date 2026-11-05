import { describe, expect, it } from "vitest";
import { POST } from "../../../apps/web/src/app/api/signout/route";

describe("同域退出", () => {
  it("清除 host-only Cookie，并使用站内地址跳转", async () => {
    const response = await POST();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/signin");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("kqa_session=;");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toMatch(/Domain=/i);
  });
});
