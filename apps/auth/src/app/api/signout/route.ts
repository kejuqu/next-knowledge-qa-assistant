import { NextResponse } from "next/server";
import { SESSION_COOKIE, getCookieDomain } from "@kqa/auth";

const AUTH_APP_URL = process.env.AUTH_APP_URL ?? "http://auth.lvh.me:6100";

export async function POST(request: Request) {
  // 跳转到对外地址，不用 request.url——Next dev 下它会解析成 localhost，
  // 经反向代理部署时也可能和对外域名不一致
  const response = NextResponse.redirect(new URL("/signin", AUTH_APP_URL), { status: 303 });
  // 删除时 domain/path 必须与写入时一致，浏览器才会匹配到同一个 cookie
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    domain: getCookieDomain(),
    path: "/",
    maxAge: 0,
  });
  return response;
}
