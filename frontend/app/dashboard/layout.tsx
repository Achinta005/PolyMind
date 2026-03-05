"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard, FileText, MessageSquare, BarChart2,
  GitCompare, Settings, LogOut, ChevronRight
} from "lucide-react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/documents", icon: FileText, label: "Documents" },
  { href: "/dashboard/chat", icon: MessageSquare, label: "Chat" },
  { href: "/dashboard/clusters", icon: BarChart2, label: "Clusters" },
  { href: "/dashboard/compare", icon: GitCompare, label: "Compare" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthLoading, user, setAccessToken, setIsAuthenticated, setUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isAuthLoading, router]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
    } finally {
      setAccessToken(null);
      setIsAuthenticated(false);
      setUser(null);
      router.push("/login");
    }
  };

  if (isAuthLoading) return (
    <div className="min-h-screen bg-[#050810] flex items-center justify-center">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-[#c8f04d]/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#c8f04d] animate-spin" />
      </div>
    </div>
  );

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#050810] flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-white/5 flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="p-5 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#c8f04d] rounded-lg flex items-center justify-center">
              <span className="text-[#050810] font-black text-sm">PM</span>
            </div>
            <span className="font-black text-lg">PolyMind</span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${active
                  ? "bg-[#c8f04d]/10 text-[#c8f04d] font-semibold"
                  : "text-white/50 hover:text-white hover:bg-white/5"
                  }`}
              >
                <item.icon size={16} />
                <span className="flex-1">{item.label}</span>
                {active && <ChevronRight size={12} className="opacity-60" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5 space-y-0.5">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-all"
          >
            <Settings size={16} />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:text-red-400 hover:bg-red-500/5 transition-all"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>

        {/* User card */}
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[#c8f04d]/20 border border-[#c8f04d]/30 flex items-center justify-center shrink-0">
              <span className="text-[#c8f04d] text-xs font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-white/30 truncate font-mono">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-60 min-h-screen">
        {children}
      </main>
    </div>
  );
}