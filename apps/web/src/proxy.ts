import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@kqa/auth/session";

/** 统一入口校验；路由/数据访问层仍独立验证身份和资源权限。 */
export async function proxy(request: NextRequest) {
  if (["/signin", "/signup", "/api/signin", "/api/signup", "/api/signout"].includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // 仅此导入端点允许由路由独立校验 Bearer Key；密钥不能访问其他 API。
  if (request.method === "POST" && request.nextUrl.pathname === "/api/team/import"
    && request.headers.has("authorization")) return NextResponse.next();

  // RequestCookies 会按名称合并 Cookie，直接读取原始头才能识别同名会话。
  const tokens = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(`${SESSION_COOKIE}=`))
    .map((entry) => entry.slice(SESSION_COOKIE.length + 1));

  let validSessions = 0;
  for (const token of tokens) {
    if (await verifySession(token)) validSessions += 1;
  }
  // 与 getSessionUser 保持一致：只能有一个合法会话。
  if (validSessions === 1) return NextResponse.next();

  if (request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/signin", request.url));
}

export const config = {
  // 除了以 _next/、__nextjs_font/ 开头的路径，以及 favicon.ico、icon.png、robots.txt、sitemap.xml 这几个特定的静态资源文件之外，
  // 其余所有的页面请求和 API 请求，都会经过（触发）这个中间件函数
  matcher: ["/((?!_next/|__nextjs_font/|favicon\\.ico$|icon\\.png$|robots\\.txt$|sitemap\\.xml$).*)"],
};
