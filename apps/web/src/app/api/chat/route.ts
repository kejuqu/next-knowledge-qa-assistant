import { getTenantUser } from "@/lib/tenant-user";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, conversations, documents, messages } from "@kqa/db";
import { streamRagAnswer } from "@kqa/ai";
import { getModelConfigForTenant } from "@/lib/model-config";

/**
 * POST /api/chat
 * body: { conversationId?: string, message: string, documentIds?: string[] }
 * 响应：text/plain 流（首个 chunk 前先发一行 JSON 元信息：会话、用户消息和引用 ID）
 */
export async function POST(request: Request) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { conversationId, message, documentIds } = await request.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // 没有会话就新建，标题取问题前 20 字
  let convId = conversationId as string | undefined;
  if (convId) {
    if (typeof convId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(convId)) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const [conversation] = await db.select({ id: conversations.id }).from(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.ownerId, user.sub))).limit(1);
    if (!conversation) return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }
  if (!convId) {
    const [conv] = await db
      .insert(conversations)
      .values({ ownerId: user.sub, title: message.slice(0, 20) })
      .returning();
    convId = conv.id;
  }

  const [userMessage] = await db
    .insert(messages)
    .values({ conversationId: convId, role: "user", content: message })
    .returning({ id: messages.id });

  const requestedDocumentIds = Array.isArray(documentIds)
    ? documentIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50)
    : [];
  // 检索范围始终收敛到 PG 里「未删除且 ready」的文档：
  // Milvus 只按 tenantId 过滤，若其中残留已删文档的向量（如重置数据库后未清理），
  // 会把失效分块召回并展示成重复/幽灵引用，所以这里用活文档 ID 列表把脏数据挡在检索之外。
  const liveDocuments = requestedDocumentIds.length
    ? await db.select({ id: documents.id }).from(documents).where(and(
        eq(documents.tenantId, user.tenantId),
        isNull(documents.deletedAt),
        eq(documents.status, "ready"),
        inArray(documents.id, requestedDocumentIds)
      ))
    : await db.select({ id: documents.id }).from(documents).where(and(
        eq(documents.tenantId, user.tenantId),
        isNull(documents.deletedAt),
        eq(documents.status, "ready")
      ));
  const permittedDocumentIds = liveDocuments.map((document) => document.id);
  const config = await getModelConfigForTenant(user.tenantId);
  const { stream, citations } = await streamRagAnswer(
    message,
    user.tenantId,
    config,
    permittedDocumentIds
  );

  const metaLine = JSON.stringify({
    conversationId: convId,
    userMessageId: userMessage.id,
    citations,
  }) + "\n";
  const encoder = new TextEncoder();
  const finalConvId = convId;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(metaLine));
      let full = "";
      try {
        for await (const chunk of stream) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        // 流结束后把完整回答落库
        await db.insert(messages).values({
          conversationId: finalConvId,
          role: "assistant",
          content: full,
          citations,
        });
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
