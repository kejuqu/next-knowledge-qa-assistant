import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, users, tenants, tenantMembers, notifications } from "@kqa/db";
import type { NotificationContent } from "@kqa/db/notifications";
import { hashPassword, signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@kqa/auth";
import { normalizeTenantName, hasPermission, isPermissionList } from "@kqa/auth/permissions";

class EmailExists extends Error {}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.name !== "string"
    || typeof body.password !== "string" || !body.name.trim() || body.password.length < 6
    || body.name.trim().length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return NextResponse.json({ error: "请填写有效的姓名和邮箱，密码至少 6 位" }, { status: 400 });
  }
  if (typeof body.tenantName !== "string" || !body.tenantName.trim() || body.tenantName.trim().length > 120) {
    return NextResponse.json({ error: "企业/团队名称须为 1–120 个字符" }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
  const passwordHash = await hashPassword(body.password);

  try {
    const { user, tenant, membership } = await db.transaction(async (tx) => {
      const [created] = await tx.insert(tenants).values({
        name: body.tenantName.trim().replace(/\s+/g, " "), nameKey: normalizeTenantName(body.tenantName),
      }).onConflictDoNothing({ target: tenants.nameKey }).returning();
      const tenant = created ?? (await tx.select().from(tenants)
        .where(eq(tenants.nameKey, normalizeTenantName(body.tenantName))).limit(1))[0];
      const [user] = await tx.insert(users).values({ email, name: body.name.trim(), passwordHash })
        .onConflictDoNothing({ target: users.email }).returning();
      if (!user) throw new EmailExists();
      const [membership] = await tx.insert(tenantMembers).values({
        tenantId: tenant.id, userId: user.id,
        role: created ? "admin" : "member", status: created ? "active" : "pending",
      }).returning();
      if (!created) {
        const managers = await tx.select().from(tenantMembers).where(and(
          eq(tenantMembers.tenantId, tenant.id), eq(tenantMembers.status, "active"),
        ));
        const recipients = managers.filter((manager) => manager.role === "admin" || hasPermission({
          role: manager.role, permissions: manager.permissions === null ? null : isPermissionList(manager.permissions) ? manager.permissions : [],
        }, "team.manage"));
        const content = {
          type: "join_request",
          body: {
            message: `${user.name}（${user.email}）申请加入 ${tenant.name}，请前往团队管理审批。`,
            tenantName: tenant.name,
            applicant: { id: user.id, name: user.name, email: user.email },
          },
        } satisfies NotificationContent;
        if (recipients.length) await tx.insert(notifications).values(recipients.map((manager) => ({
          tenantId: tenant.id, userId: manager.userId, membershipId: membership.id,
          ...content, title: "新的团队加入申请",
        })));
      }
      return { user, tenant, membership };
    });
    const token = await signSession({
      sub: user.id, email: user.email, name: user.name,
      tenantId: tenant.id, tenantName: tenant.name, role: membership.role,
    });
    const response = NextResponse.json({ ok: true, membershipStatus: membership.status });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    if (error instanceof EmailExists) return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
    throw error;
  }
}
