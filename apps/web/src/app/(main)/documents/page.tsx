"use client";

import { usePermission } from "@/components/tenant-role";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@kqa/ui/components/skeleton";
import { UploadButton } from "@/components/documents/upload-button";
import { EmptyState } from "@/components/documents/empty-state";
import { DocumentList, type DocumentItem } from "@/components/documents/document-list";
import { UploadProgressList } from "@/components/documents/upload-progress";
import { useDocumentUpload } from "@/components/documents/use-document-upload";
import { useDocumentEvents } from "@/components/documents/use-document-events";

export default function DocumentsPage() {
  const canUpload = usePermission("documents.upload");
  const { upload, tasks, error } = useDocumentUpload();
  // SSE：服务端处理状态变更实时推送到 TanStack Query 缓存
  useDocumentEvents();

  const { data: docs = [], isLoading, error: loadError, refetch } = useQuery<DocumentItem[]>({
    queryKey: ["documents"],
    retry: false,
    queryFn: async ({ signal }) => {
      const timeout = AbortSignal.timeout(15_000);
      try {
        const response = await fetch("/api/documents", {
          signal: AbortSignal.any([signal, timeout]),
        });
        if (response.status === 401) throw new Error("登录已失效，请刷新页面重新登录。");
        if (!response.ok) throw new Error("知识库加载失败，请稍后重试。");
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error("知识库数据格式异常，请稍后重试。");
        return data;
      } catch (error) {
        if (timeout.aborted) throw new Error("知识库请求超时，请检查网络后重试。");
        throw error;
      }
    },
  });

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">知识库</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              支持 PDF / Word(docx) / Markdown / TXT / HTML，解析后自动切分并向量化到 Milvus
            </p>
          </div>
          {canUpload && docs.length > 0 && <UploadButton onSelect={upload} />}
        </div>

        {error && <p role="alert" className="mb-4 whitespace-pre-line text-sm text-destructive">{error}</p>}

        <UploadProgressList tasks={tasks} />

        {isLoading ? (
          <DocumentListSkeleton />
        ) : loadError ? (
          <div role="alert" className="rounded-xl bg-card p-4 text-sm">
            <p className="text-destructive">{loadError instanceof TypeError ? "无法连接知识库，请检查网络后重试。" : loadError.message}</p>
            <button type="button" onClick={() => void refetch()} className="mt-3 text-primary underline underline-offset-4">重新加载</button>
          </div>
        ) : docs.length === 0 && tasks.length === 0 ? (
          canUpload ? <EmptyState onSelect={upload} /> : (
            <p className="py-20 text-center text-sm text-muted-foreground">知识库暂无文档，请联系管理员上传。</p>
          )
        ) : (
          <DocumentList docs={docs} />
        )}
      </div>
    </div>
  );
}

function DocumentListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-label="正在加载文档" role="status">
      {["first", "second", "third"].map((key) => (
        <div key={key} className="flex items-center gap-3 rounded-xl bg-card p-4">
          <Skeleton className="size-5 shrink-0 rounded" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
