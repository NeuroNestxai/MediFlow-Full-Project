"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { CalendarIcon, UsersIcon, BellIcon, InfoIcon } from "@/components/ui/Icons";

const items = [
  { href: "/doctor/dashboard", label: "Dashboard", icon: <InfoIcon /> },
  { href: "/doctor/schedule", label: "Schedule", icon: <CalendarIcon /> },
  { href: "/doctor/patients", label: "Patients", icon: <UsersIcon /> },
  { href: "/doctor/follow-ups", label: "Follow-Ups", icon: <BellIcon /> },
  { href: "/doctor/profile", label: "Profile", icon: <InfoIcon /> },
];

export function DoctorBottomNav() {
  const pathname = usePathname();
  return <BottomNav items={items} activeHref={pathname} navLabel="Doctor navigation" />;
}
