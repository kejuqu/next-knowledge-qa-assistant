import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@kqa/auth";

export async function POST() {
  // 相对 Location 保留浏览器当前域名，兼容 HTTPS 反向代理。
  const response = new NextResponse(null, { status: 303, headers: { Location: "/signin" } });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 0,
  });
  return response;
}
