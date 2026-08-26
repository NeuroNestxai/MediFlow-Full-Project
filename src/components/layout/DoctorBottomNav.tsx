"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { CalendarIcon, UsersIcon, BellIcon, HomeIcon, MenuIcon } from "@/components/ui/Icons";

const items = [
  { href: "/doctor/dashboard", label: "Dashboard", icon: <HomeIcon /> },
  { href: "/doctor/schedule", label: "Schedule", icon: <CalendarIcon /> },
  { href: "/doctor/patients", label: "Patients", icon: <UsersIcon /> },
  { href: "/doctor/follow-ups", label: "Follow-Ups", icon: <BellIcon /> },
  { href: "/doctor/profile", label: "Profile", icon: <MenuIcon /> },
];

export function DoctorBottomNav() {
  const pathname = usePathname();
  return <BottomNav items={items} activeHref={pathname} navLabel="Doctor navigation" />;
}
