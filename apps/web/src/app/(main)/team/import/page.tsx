import { redirect } from "next/navigation";
import { hasPermission } from "@kqa/auth/permissions";
import { getTenantUser } from "@/lib/tenant-user";
import { TeamImportManagement } from "@/components/team-import-management";

export default async function TeamImportPage() {
  const user = await getTenantUser();
  if (!user) redirect("/membership");
  if (!hasPermission(user, "team.manage")) redirect("/team");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">导入员工</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user.tenantName} · 通过 Excel 或 API 批量添加员工</p>
      </div>
      <TeamImportManagement />
    </div>
  );
}
