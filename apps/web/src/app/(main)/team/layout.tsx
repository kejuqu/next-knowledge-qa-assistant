import { TeamQuickNavigation } from "@/components/team-quick-navigation";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="team-page p-4 md:p-6">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(11rem,1fr)_minmax(0,48rem)_minmax(0,1fr)] lg:gap-8">
        <TeamQuickNavigation />
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">{children}</div>
      </div>
    </div>
  );
}
