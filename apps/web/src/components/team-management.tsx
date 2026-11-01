"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@kqa/ui/components/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@kqa/ui/components/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@kqa/ui/components/dialog";
import { FieldGroup, Field, FieldLabel, FieldSet, FieldLegend, FieldContent, FieldDescription } from "@kqa/ui/components/field";
import { Checkbox } from "@kqa/ui/components/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@kqa/ui/components/select";
import { Skeleton } from "@kqa/ui/components/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from "@kqa/ui/components/empty";
import { UserRoundCheck } from "lucide-react";
import { UserAvatar } from "./user-avatar";
import { PERMISSIONS, effectivePermissions, type Permission, type TenantRole, type MembershipStatus } from "@kqa/auth/permissions";
import { usePermission, useTenantAccess } from "./tenant-role";

type Member = { id: string; userId: string; name: string; email: string; avatarUrl: string | null; role: TenantRole; status: MembershipStatus; permissions: Permission[] | null; createdAt: string };
type Team = { tenantName: string; userId: string; members: Member[] };

export function TeamManagement() {
  const canManage = usePermission("team.manage");
  const canSetRoles = usePermission("roles.manage");
  const actor = useTenantAccess();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [editing, setEditing] = useState<Member | null>(null);
  const [role, setRole] = useState<TenantRole>("member");
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data, isPending, error: loadError } = useQuery<Team>({
    queryKey: ["team"], enabled: canManage || canSetRoles, refetchInterval: 15_000,
    queryFn: async () => {
      const response = await fetch("/api/team");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "团队加载失败");
      return body;
    },
  });

  function edit(member: Member) {
    setEditing(member);
    setRole(member.status === "pending" ? "member" : member.role);
    setPermissions(member.status === "pending" ? null : member.permissions);
    setError("");
  }

  async function update(member: Member, action: "approve" | "reject" | "update") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/team", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: member.id, action, ...(action !== "reject" && canSetRoles ? { role, permissions } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "操作失败");
      setEditing(null);
      await Promise.all(["team", "notifications", "membership"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失败，请重试");
    } finally { setBusy(false); }
  }

  if (!canManage && !canSetRoles) return <p className="p-6 text-muted-foreground">你没有团队管理权限，请联系管理员。</p>;
  if (isPending) return <div className="flex flex-col gap-4" role="status" aria-label="正在加载团队"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full" /></div>;
  const pending = data?.members.filter((member) => member.status === "pending") ?? [];
  const active = data?.members.filter((member) => member.status === "active") ?? [];
  const rejected = data?.members.filter((member) => member.status === "rejected") ?? [];
  const selected = effectivePermissions({ role, permissions });
  const available = effectivePermissions(actor);

  return (
    <>
      <div className="flex min-w-0 flex-col gap-6">
        <div><h1 className="text-xl font-semibold">团队管理</h1><p className="mt-1 text-sm text-muted-foreground">{data?.tenantName} · 审批加入申请，管理成员角色与操作权限</p></div>
        {(loadError || (error && !editing)) && <p role="alert" className="text-sm text-destructive">{loadError?.message ?? error}</p>}
        <Card id="team-management" className="team-section scroll-mt-52 lg:scroll-mt-6" tabIndex={-1}>
          <section id="team-members" className="team-section flex scroll-mt-52 flex-col lg:scroll-mt-6" tabIndex={-1}>
          <CardHeader><CardTitle>团队成员{active.length > 0 && ` (${active.length})`}</CardTitle><CardDescription>管理员默认拥有全部权限，也可通过勾选自定义权限。</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-5">
            {active.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3">
              <UserAvatar name={member.name} src={member.avatarUrl} className="size-10" />
              <div className="min-w-0 flex-1"><p className="font-medium">{member.name}{member.userId === data?.userId && "（你）"} <span className="text-xs text-muted-foreground">{member.role === "admin" ? "管理员" : "成员"}</span></p>
                <p className="break-all text-sm text-muted-foreground">{member.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{member.permissions === null ? member.role === "admin" ? "全部管理权限" : "基础访问：问答、查看及下载文档" : effectivePermissions(member).map((permission) => PERMISSIONS.find((item) => item.key === permission)?.label).join("、") || "基础访问：问答、查看及下载文档"}</p>
              </div>
              {canSetRoles && <Button variant="outline" disabled={busy} onClick={() => edit(member)} aria-label={`设置 ${member.name} 的权限`}>设置权限</Button>}
            </div>)}
          </CardContent>
          </section>
        <section id="join-requests" aria-labelledby="join-requests-title" className="team-section mx-6 flex scroll-mt-52 flex-col gap-4 border-t py-6 lg:scroll-mt-6" tabIndex={-1}>
          <div><h2 id="join-requests-title" className="font-semibold">加入申请{pending.length > 0 && ` (${pending.length})`}</h2><p className="mt-1 text-sm text-muted-foreground">通过审批后，成员才可访问团队知识库。</p></div>
          <div className="flex flex-col gap-4">
            {!pending.length && <Empty className="empty-state relative overflow-hidden border border-theme-border/70 bg-gradient-to-b from-primary/[0.06] via-muted/40 to-transparent py-10 md:py-12">
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="empty-glow absolute left-1/2 top-1/2 size-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />
              </div>
              <EmptyHeader className="relative">
                <div className="relative mb-3">
                  <div aria-hidden className="empty-orbit absolute -inset-2.5 rounded-full border border-dashed border-primary/25" />
                  <EmptyMedia variant="icon" className="size-13 rounded-full border border-primary/25 bg-gradient-to-b from-primary/30 to-primary/5 text-primary shadow-[inset_0_1px_0_0] shadow-primary/25">
                    <UserRoundCheck className="size-6" />
                  </EmptyMedia>
                </div>
                <EmptyDescription>这里没有加入团队的申请哦</EmptyDescription>
              </EmptyHeader>
            </Empty>}
            {pending.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3">
              <UserAvatar name={member.name} src={member.avatarUrl} className="size-10" />
              <div className="min-w-0 flex-1"><p className="font-medium">{member.name}</p><p className="break-all text-sm text-muted-foreground">{member.email} · {new Date(member.createdAt).toLocaleString("zh-CN")}</p></div>
              {canManage && <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => { edit(member); }}>审核申请</Button></div>}
            </div>)}
          </div>
        </section>
        </Card>
        {rejected.length > 0 && <p className="text-xs text-muted-foreground">已拒绝 {rejected.length} 个加入申请</p>}
      </div>
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={!busy}>
          <DialogHeader className="shrink-0 px-6 pb-5 pt-6"><DialogTitle>{editing?.status === "pending" ? "审核加入申请" : "设置成员权限"}</DialogTitle><DialogDescription>{editing?.name} · {editing?.email}</DialogDescription></DialogHeader>
          <form className="flex min-h-0 flex-col" onSubmit={(event) => { event.preventDefault(); if (editing) void update(editing, editing.status === "pending" ? "approve" : "update"); }}>
            <div className="min-h-0 overflow-y-auto px-6 pb-5">
            {canSetRoles ? <FieldGroup>
              <Field data-disabled={busy}>
                <FieldLabel htmlFor="member-role">角色</FieldLabel>
                <Select value={role} disabled={busy} onValueChange={(value) => { setRole(value as TenantRole); setPermissions(null); }}>
                  <SelectTrigger id="member-role" className="w-full"><SelectValue placeholder="选择角色" /></SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectGroup>
                      <SelectItem value="member">成员</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <FieldSet disabled={busy}><FieldLegend>操作权限</FieldLegend>
                <FieldDescription>所有已通过审批的成员都可问答、查看和下载文档。只能分配自己拥有的管理权限。</FieldDescription>
                <FieldGroup>
                  {PERMISSIONS.map((permission) => (
                    <Field key={permission.key} orientation="horizontal" data-disabled={busy || !available.includes(permission.key)}>
                      <Checkbox
                        id={`permission-${permission.key}`}
                        checked={selected.includes(permission.key)}
                        disabled={busy || !available.includes(permission.key)}
                        aria-describedby={`permission-${permission.key}-description`}
                        onCheckedChange={(checked) => setPermissions(checked === true ? [...selected, permission.key] : selected.filter((key) => key !== permission.key))}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`permission-${permission.key}`}>{permission.label}</FieldLabel>
                        <FieldDescription id={`permission-${permission.key}-description`}>{permission.description}</FieldDescription>
                      </FieldContent>
                    </Field>
                  ))}
                </FieldGroup>
                <Button type="button" variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => setPermissions(null)}>恢复角色默认权限</Button>
              </FieldSet>
            </FieldGroup> : <p className="text-sm text-muted-foreground">通过后将以成员身份加入，拥有问答、查看和下载文档的基础权限。其他权限由有授权权限的管理员设置。</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter className="shrink-0 border-t px-6 py-4">
              {editing?.status === "pending" && <Button type="button" variant="destructive" disabled={busy} onClick={() => void update(editing, "reject")}>拒绝申请</Button>}
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>取消</Button>
              <Button type="submit" disabled={busy}>{busy ? "处理中…" : editing?.status === "pending" ? "批准加入" : "保存权限"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
