"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { CheckIcon, ClockIcon, UsersIcon, HomeIcon, MenuIcon } from "@/components/ui/Icons";

const items = [
  { href: "/reception/dashboard", label: "Dashboard", icon: <HomeIcon /> },
  { href: "/reception/check-in", label: "Check-In", icon: <CheckIcon /> },
  { href: "/reception/queue", label: "Queue", icon: <ClockIcon /> },
  { href: "/reception/patients", label: "Patients", icon: <UsersIcon /> },
  { href: "/reception/profile", label: "More", icon: <MenuIcon /> },
];

export function ReceptionBottomNav() {
  const pathname = usePathname();
  return <BottomNav items={items} activeHref={pathname} navLabel="Reception navigation" />;
}
