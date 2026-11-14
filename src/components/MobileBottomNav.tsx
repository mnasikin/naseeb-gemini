import { Archive, BookOpen, Clock } from 'lucide-react';

export type ActiveTab = 'simulation' | 'timeline' | 'archive';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  timelineCount: number;
  archiveCount: number;
}

export function MobileBottomNav({
  activeTab,
  onSelectTab,
  timelineCount,
  archiveCount,
}: MobileBottomNavProps) {
  const items: {
    id: ActiveTab;
    label: string;
    icon: typeof BookOpen;
    count?: number;
  }[] = [
    { id: 'simulation', label: 'Simulasi', icon: BookOpen },
    { id: 'timeline', label: 'Linimasa', icon: Clock, count: timelineCount > 0 ? timelineCount : undefined },
    { id: 'archive', label: 'Arsip', icon: Archive, count: archiveCount > 0 ? archiveCount : undefined },
  ];

  return (
    <nav
      aria-label="Navigasi seluler"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/92 backdrop-blur-md border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-3 h-14">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] transition-colors relative ${
                isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 1.75} />
              <span className="text-[11px] font-medium tracking-tight mt-0.5 whitespace-nowrap">
                {item.label}
                {item.count !== undefined ? ` (${item.count})` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
