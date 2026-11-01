"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@kqa/ui/lib/utils";
import { usePermission } from "./tenant-role";

const pages = [
  { href: "/team", label: "团队管理" },
  { href: "/team/import", label: "导入员工", managerOnly: true },
];

export function TeamQuickNavigation() {
  const pathname = usePathname();
  const canManage = usePermission("team.manage");

  return (
    <nav aria-label="团队管理导航" className="sticky top-0 z-10 rounded-xl bg-background py-3 lg:col-start-1 lg:row-start-1 lg:top-6 lg:z-auto lg:w-44 lg:justify-self-start lg:py-0">
      <ul className="flex flex-wrap gap-1 lg:flex-col lg:border-l lg:pl-3">
        {pages.filter((page) => !page.managerOnly || canManage).map((page) => {
          const active = pathname === page.href;
          return <li key={page.href}>
            <Link href={page.href} aria-current={active ? "page" : undefined}
              className={cn("block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "font-medium text-primary")}>
              {page.label}
            </Link>
          </li>;
        })}
      </ul>
    </nav>
  );
}
