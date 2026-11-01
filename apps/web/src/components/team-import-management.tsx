"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, Download, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@kqa/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@kqa/ui/components/button";
import { Input } from "@kqa/ui/components/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@kqa/ui/components/card";
import { FieldGroup, Field, FieldLabel } from "@kqa/ui/components/field";

type ApiKey = { id: string; name: string; prefix: string; createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null };
type ImportResult = { added: number; skipped: number; failed: number; results: { row: number; email: string; status: string; message: string }[] };
const example = `curl -X POST "$APP_URL/api/team/import" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"employees":[{"name":"张三","email":"zhangsan@example.com","password":"CHANGE_THIS_PASSWORD"}]}'`;

export function TeamImportManagement() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const keys = useQuery<{ keys: ApiKey[] }>({ queryKey: ["team-api-keys"], queryFn: async () => {
    const response = await fetch("/api/team/api-keys");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "密钥加载失败");
    return body;
  } });

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "操作失败，请重试"); }
    finally { setBusy(false); }
  }
  function chooseFile(files: FileList | File[] | null) {
    if (importing || !files?.length) return;
    setUploadError(""); setResult(null);
    const candidate = files[0]!;
    if (files.length !== 1 || !candidate.name.toLowerCase().endsWith(".xlsx") || candidate.size > 1024 * 1024 || !candidate.size) {
      setFile(null);
      setUploadError("请选择一个不超过 1 MB 的非空 .xlsx 文件。");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(candidate);
  }
  function removeFile() {
    setFile(null); setUploadError("");
    if (fileRef.current) fileRef.current.value = "";
  }
  async function importFile() {
    if (!file || importing) return;
    setImporting(true); setUploadError(""); setResult(null);
    try {
      const response = await fetch("/api/team/import", { method: "POST", headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, body: file });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "导入失败");
      setResult(body); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await Promise.all(["team", "notifications"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      router.refresh();
    } catch (error) { setUploadError(error instanceof Error ? error.message : "上传失败，请重试"); }
    finally { setImporting(false); }
  }
  async function mutateKey(method: "POST" | "DELETE", payload: object) {
    const response = await fetch("/api/team/api-keys", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "操作失败");
    if (method === "POST") { setSecret(body.key); setCopied(false); setName(""); }
    await queryClient.invalidateQueries({ queryKey: ["team-api-keys"] });
  }

  return <>
    <Card id="employee-import" className="team-section scroll-mt-52 lg:scroll-mt-6" tabIndex={-1}>
      <CardHeader><CardTitle>批量导入员工</CardTitle><CardDescription>上传 Excel，将员工直接添加至当前团队，无需再次审批。</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form onSubmit={(event) => { event.preventDefault(); void importFile(); }} className="flex flex-col gap-4" aria-busy={importing}>
          <FieldGroup><Field data-invalid={!!uploadError}>
            <FieldLabel className="sr-only" htmlFor="employee-excel">员工 Excel 文件</FieldLabel>
            <input ref={fileRef} id="employee-excel" type="file" accept=".xlsx" className="sr-only" tabIndex={-1} disabled={importing}
              aria-describedby="employee-upload-help" aria-invalid={!!uploadError} onChange={(event) => chooseFile(event.target.files)} />
            <div className={cn("rounded-xl border border-dashed transition-colors", dragging ? "border-primary bg-primary/10" : "border-theme-border bg-muted/20", uploadError && "border-destructive")}
              onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); if (!importing) { dragDepth.current++; setDragging(true); } }}
              onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = importing ? "none" : "copy"; }}
              onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); if (!importing) chooseFile(event.dataTransfer.files); }}>
              {file ? <div className="flex flex-wrap items-center gap-3 p-5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileSpreadsheet className="size-5" aria-hidden /></div>
                <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{file.name}</p><p className="mt-1 text-xs text-muted-foreground">{Math.max(1, Math.ceil(file.size / 1024))} KB · {importing ? "正在上传并导入，请稍候…" : "已选择，准备导入"}</p></div>
                <Button type="button" variant="ghost" size="sm" disabled={importing} onClick={() => fileRef.current?.click()}>重新选择</Button>
                <Button type="button" variant="ghost" size="icon" disabled={importing} onClick={removeFile} aria-label="移除已选文件"><X /></Button>
              </div> : <button type="button" disabled={importing} onClick={() => fileRef.current?.click()}
                aria-describedby="employee-upload-help" className="flex w-full flex-col items-center gap-3 rounded-xl px-5 py-8 text-center outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:py-10">
                <span className="flex size-12 items-center justify-center rounded-xl border bg-card text-primary"><Upload className="size-5" aria-hidden /></span>
                <span className="flex flex-col gap-1.5"><span className="text-sm font-medium">{dragging ? "松开以添加员工名单" : <>将 Excel 文件拖到这里，或<span className="text-primary">点击上传</span></>}</span><span className="text-xs text-muted-foreground">支持 .xlsx · 文件不超过 1 MB · 每批最多 100 人</span></span>
              </button>}
            </div>
            {uploadError && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{uploadError}</p>}
          </Field></FieldGroup>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="outline" className="w-full sm:w-auto"><a href="/api/team/import/template"><Download data-icon="inline-start" />下载模板</a></Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={importing || !file}>{importing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Upload data-icon="inline-start" />}{importing ? "正在导入…" : "上传并导入"}</Button>
          </div>
        </form>
        <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">查看导入规则</summary><p id="employee-upload-help" className="mt-2 leading-relaxed">请使用模板中的姓名、邮箱、初始密码三列，以纯文本填写。姓名、邮箱为必填；新账号须填写至少 8 位、最多 72 字节的初始密码。已有账号保持原密码，重复成员自动跳过，其他团队账号不支持导入。</p></details>
        {result && <div role="status" className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 text-sm">
          <div className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden /><p className="font-medium">导入完成</p></div>
          <p className="text-muted-foreground">已添加 {result.added} 人 · 跳过 {result.skipped} 人 · 失败 {result.failed} 人</p>
          <details><summary className="w-fit cursor-pointer text-xs text-muted-foreground">查看逐行结果</summary><ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-auto">{result.results.map((row) => <li key={row.row} className="break-all text-xs">第 {row.row} 条 · {row.email} · {row.message}</li>)}</ul></details>
        </div>}
      </CardContent>
    </Card>
    <Card id="employee-api-keys" className="team-section scroll-mt-52 lg:scroll-mt-6" tabIndex={-1}>
      <CardHeader><CardTitle>员工导入 API Key</CardTitle><CardDescription>为外部系统创建专用密钥，仅能向当前团队导入普通成员，有效期 90 天。</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => mutateKey("POST", { name })); }}>
          <FieldGroup><Field><FieldLabel htmlFor="employee-key-name">密钥名称</FieldLabel><Input id="employee-key-name" placeholder="例如：HR 系统同步" maxLength={100} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} required /></Field></FieldGroup>
          <Button type="submit" className="self-start" disabled={busy || !name.trim() || !!secret}>创建 API Key</Button>
        </form>
        {secret && <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">请立即保存，完整密钥仅在此显示一次。</p>
          <FieldGroup><Field><FieldLabel htmlFor="new-employee-key">新 API Key</FieldLabel><Input id="new-employee-key" readOnly value={secret} onFocus={(event) => event.target.select()} /></Field></FieldGroup>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void run(async () => { await navigator.clipboard.writeText(secret); setCopied(true); })}>{copied ? "已复制" : "复制密钥"}</Button><Button variant="ghost" onClick={() => setSecret("")}>已保存，关闭显示</Button></div>
        </div>}
        {keys.isPending && <p role="status" className="text-sm text-muted-foreground">正在加载密钥…</p>}
        {keys.error && <p role="alert" className="text-sm text-destructive">{keys.error.message}</p>}
        {keys.data?.keys.length === 0 && <p className="text-sm text-muted-foreground">尚未创建 API Key。</p>}
        <ul className="flex flex-col gap-3">{keys.data?.keys.map((key) => <li key={key.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm"><p className="break-all font-medium">{key.name} · {key.revokedAt ? "已撤销" : new Date(key.expiresAt) <= new Date() ? "已过期" : "有效"}</p>
            <p className="text-muted-foreground">{key.prefix}… · 到期 {new Date(key.expiresAt).toLocaleDateString("zh-CN")}</p>
            <p className="text-muted-foreground">最近调用：{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString("zh-CN") : "从未"}</p>
          </div>
          {!key.revokedAt && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await mutateKey("DELETE", { id: key.id }); setSecret(""); })} aria-label={`撤销密钥 ${key.name}`}>撤销</Button>}
        </li>)}</ul>
        <p className="text-sm text-muted-foreground">调用 POST /api/team/import，通过 Authorization: Bearer 传入密钥。每批最多 100 人，同一密钥调用间隔至少 1 秒。无需传 tenantId，密钥撤销或创建者失去团队管理权限后失效。</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{example}</code></pre>
      </CardContent>
    </Card>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </>;
}
