import { Activity, Building2, ListChecks, Orbit, Settings } from "lucide-react";

export const NAV = [
  { href: "/", label: "Orbit", icon: Orbit, exact: true },
  { href: "/tasks", label: "Tasks", icon: ListChecks, exact: false },
  { href: "/clients", label: "Clients", icon: Building2, exact: false },
  { href: "/activity", label: "Activity", icon: Activity, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
] as const;

export function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

export type NavClient = { id: string; name: string; code: string; health: "on_track" | "at_risk" | "blocked" };
