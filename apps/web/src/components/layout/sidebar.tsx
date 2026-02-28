"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: "📊" },
  { name: "Profile", href: "/dashboard/profile", icon: "👤" },
  { name: "Analyze Job", href: "/dashboard/analyze", icon: "🔍" },
  { name: "Tracker", href: "/dashboard/tracker", icon: "📋" },
  { name: "Pipeline", href: "/dashboard/pipeline", icon: "📬" },
  { name: "Insights", href: "/dashboard/insights", icon: "💡" },
  { name: "Cost Admin", href: "/dashboard/admin", icon: "💰" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col w-64 border-r bg-white p-4 gap-1">
      <div className="mb-6 px-3">
        <h1 className="text-lg font-bold">Job App Assistant</h1>
        <p className="text-sm text-muted-foreground">AI-powered job search</p>
      </div>
      {navigation.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
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
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
