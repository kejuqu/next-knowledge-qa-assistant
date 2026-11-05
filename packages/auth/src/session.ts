/** 同域会话：使用 HttpOnly、Path=/ 的 host-only Cookie，不设置 Domain。 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "kqa_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天
export const SESSION_ISSUER = "kqa-auth"; // 本系统签发的标识,防止其它系统用同密钥签的 token 被混用
export const SESSION_AUDIENCE = "kqa"; // 接受方标识;未来按 app 细分 audience 时在此扩展

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  tenantId: string;
  tenantName: string;
  role: "admin" | "member";
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  // 将 secret 按 UTF-8 编码转换成字节数组（Uint8Array），jose 的 sign() 接受 Uint8Array
  return new TextEncoder().encode(secret);
}

// 把用户信息打包成一个 JWT（JSON Web Token），并用服务端密钥签名
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    tenantId: payload.tenantId,
    tenantName: payload.tenantName,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" }) // 指定签名算法为 HS256（HMAC-SHA256，对称密钥）。这个 header 也会进 token，验签时用来判断用哪种算法
    .setSubject(payload.sub) // 设置标准 claim sub（subject），即用户 ID。等价于在 payload 里写 sub: payload.sub，但用 API 更规范。JWT 规范里 sub 就是“这个 token 代表谁”
    .setIssuedAt() // 设置标准 claim iat（签发时间），默认当前时间
    .setIssuer(SESSION_ISSUER) // 一个 iss 认证中心，可以给多个业务应用发 token；aud 用来区分「这个 token 是给 A 应用的，不能拿到 B 应用去用
    .setAudience(SESSION_AUDIENCE) // 设置标准 claim aud（接受方标识），这个 Token 是发给谁用的，这个令牌的目标接收应用
    .setExpirationTime(`${SESSION_MAX_AGE}s`) // 设置标准 claim exp（过期时间）。SESSION_MAX_AGE 是秒数，拼成 "3600s" 这种相对时间字符串，jose 会算成绝对时间戳。过期后验签会失败，这是会话自动失效的核心机制
    .sign(getSecret()); // 用密钥做 HMAC-SHA256 签名， 返回 header.payload.signature， jose 的 sign() 接受 Uint8Array 或 KeyLike
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: SESSION_ISSUER, audience: SESSION_AUDIENCE });
    // 老版本 token（无租户字段）视为无效，强制重新登录
    if (!payload.sub || !payload.tenantId) return null;

    // 最终返回验证后的用户会话信息。
    return {
      sub: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
      tenantId: payload.tenantId as string,
      tenantName: payload.tenantName as string,
      role: payload.role as "admin" | "member",
    };
  } catch {
    return null;
  }
}
