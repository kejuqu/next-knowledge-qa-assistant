import { redirect } from "next/navigation";
import { getTenantUser } from "@/lib/tenant-user";
import { TenantRoleProvider } from "@/components/tenant-role";
import { BookOpenCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMobileOverlay,
  SidebarMobileTrigger,
  SidebarMobileClose,
  SidebarProvider,
  SidebarRail,
} from "@kqa/ui/components/sidebar";
import { ConversationSearch } from "@/components/chat/conversation-search";
import { ChatNavigation } from "@/components/chat/chat-navigation";
import { UserMenu } from "@/components/user-menu";
import { NotificationMenu } from "@/components/notification-menu";

const AUTH_APP_URL = process.env.AUTH_APP_URL ?? "http://auth.lvh.me:6100";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getTenantUser();
  if (!user) redirect("/membership");

  return (
    <TenantRoleProvider role={user.role} permissions={user.permissions}>
      <SidebarProvider className="app-shell h-dvh min-h-0 overflow-hidden">
        <Sidebar className="h-dvh p-3.5">
          <SidebarHeader className="mb-6">
            <div className="mb-1 flex items-center gap-2.5 group-data-[state=collapsed]/sidebar:justify-center">
              <div data-sidebar-label className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <BookOpenCheck className="size-4" />
              </div>
              <span data-sidebar-label className="min-w-0 flex-1 truncate font-semibold tracking-tight">知识问答助手</span>
              <div className="flex shrink-0 items-center gap-0 group-data-[state=collapsed]/sidebar:flex-col-reverse group-data-[state=collapsed]/sidebar:gap-1">
                <NotificationMenu />
                <ConversationSearch />
                <SidebarMobileClose />
              </div>
            </div>
            <p data-sidebar-label className="truncate px-1.5 text-xs text-sidebar-foreground/60">{user.tenantName}</p>
          </SidebarHeader>
          <SidebarContent>
            <ChatNavigation />
          </SidebarContent>
          <SidebarFooter className="pt-3.5">
            <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} signOutUrl={`${AUTH_APP_URL}/api/signout`} />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarMobileOverlay />
        <SidebarMobileTrigger />
        <main id="main-content" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pt-16 md:pt-0">{children}</main>
      </SidebarProvider>
    </TenantRoleProvider>
  );
}
