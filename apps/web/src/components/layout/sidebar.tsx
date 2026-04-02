"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Today", href: "/dashboard", icon: "🎯", countKey: "today" as const },
  { name: "Jobs", href: "/dashboard/jobs", icon: "💼", countKey: "jobs" as const },
  { name: "Insights", href: "/dashboard/insights", icon: "💡", countKey: null },
  { name: "Settings", href: "/dashboard/settings", icon: "⚙️", countKey: null },
];

export function Sidebar() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<{ today: number; jobs: number }>({
    today: 0,
    jobs: 0,
  });
  const [plan, setPlan] = useState<{ type: string; used: number; total: number } | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const [todayRes, leadsRes] = await Promise.all([
        fetch("/api/today-actions"),
        fetch("/api/pipeline/leads?status=pending_review&count_only=true"),
      ]);

      let todayCount = 0;
      let jobsCount = 0;

      if (todayRes.ok) {
        const data = await todayRes.json();
        const urgent = data.actions?.filter(
          (a: { priority: string }) => a.priority === "urgent"
        );
        todayCount = urgent?.length ?? 0;
      }

      if (leadsRes.ok) {
        const data = await leadsRes.json();
        jobsCount = Array.isArray(data) ? data.length : 0;
      }

      setCounts({ today: todayCount, jobs: jobsCount });

      const subRes = await fetch("/api/subscription");
      if (subRes.ok) {
        const subData = await subRes.json();
        setPlan({
          type: subData.plan_type,
          used: subData.applications_used,
          total: subData.total_available,
        });
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  return (
    <nav className="flex flex-col w-64 border-r bg-white p-4 gap-1">
      <div className="mb-6 px-3">
        <h1 className="text-lg font-bold">Job App Assistant</h1>
        <p className="text-sm text-muted-foreground">AI-powered job search</p>
      </div>
      {navigation.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const count = item.countKey ? counts[item.countKey] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-gray-100 text-gray-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <span>{item.icon}</span>
            <span className="flex-1">{item.name}</span>
            {count > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-red-100 text-red-700 text-xs font-semibold min-w-[20px] h-5 px-1.5">
                {count}
              </span>
            )}
          </Link>
        );
      })}

      {/* Plan info & upgrade nudge */}
      <div className="mt-auto pt-4 px-3 border-t">
        {plan && (
          <div className="text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>{plan.used}/{plan.total} apps</span>
              <span className="capitalize">{plan.type === "career_maintenance" ? "Maintenance" : plan.type}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
              <div
                className={cn(
                  "h-1.5 rounded-full",
                  plan.used >= plan.total ? "bg-red-500" : plan.used >= plan.total * 0.8 ? "bg-yellow-500" : "bg-primary"
                )}
                style={{ width: `${Math.min((plan.used / Math.max(plan.total, 1)) * 100, 100)}%` }}
              />
            </div>
            {plan.type === "free" && (
              <Link
                href="/dashboard/settings?tab=billing"
                className="block mt-2 text-primary hover:underline text-xs font-medium"
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
