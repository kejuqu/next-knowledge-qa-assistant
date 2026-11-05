import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users, tenants, tenantMembers } from "@kqa/db";
import {
  verifyPassword,
  signSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@kqa/auth";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  }

  // 查租户成员关系（当前设计：一个用户只属于一个租户，多租户切换留给后续迭代）
  const [membership] = await db
    .select({
      tenantId: tenantMembers.tenantId,
      role: tenantMembers.role,
      status: tenantMembers.status,
      tenantName: tenants.name,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(eq(tenantMembers.userId, user.id))
    .limit(1);

  if (!membership) {
    return NextResponse.json(
      { error: "该账号不属于任何租户" },
      { status: 403 },
    );
  }

  // 把 用户信息 + 当前租户/角色 签成一个 HS256 的 JWT
  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    tenantId: membership.tenantId,
    tenantName: membership.tenantName,
    role: membership.role,
  });

  const response = NextResponse.json({ ok: true, membershipStatus: membership.status });

  // response.cookies.set() 这个便捷 API，能在响应上挂 Set-Cookie 头，必须运行在 Route Handler
  response.cookies.set(SESSION_COOKIE, token, {
    // document.cookie 读不到这个 Cookie。防 XSS 偷 token 的关键。前端拿不到 token，也就无法把它放进 Authorization 头——所以这套是纯 Cookie 会话方案。
    httpOnly: true,
    // lax：跨站请求默认不带 Cookie，但顶级导航（点链接、GET 跳转）会带。能挡住大部分 CSRF，同时不影响用户从外部链接点进来还能保持登录。
    sameSite: "lax",
    // 生产环境强制 HTTPS，防止 token 在明文 HTTP 上被窃听。本地开发用 http://localhost 时关掉，否则 Cookie 不会生效。
    secure: process.env.NODE_ENV === "production",
    // 所有路径的请求都会带上。如果只想让 /api 或 /app 带，可以收窄，减少暴露面
    path: "/",
    // Cookie 在浏览器端的存活时间。到期浏览器自动删除。maxAge 必须和 JWT 的 exp 一致
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
