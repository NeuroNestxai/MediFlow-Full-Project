"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { InfoIcon, CalendarIcon, UsersIcon } from "@/components/ui/Icons";

const items = [
  { href: "/reception/dashboard", label: "Dashboard", icon: <InfoIcon /> },
  { href: "/reception/qr-scan", label: "Scan QR", icon: <InfoIcon /> },
  { href: "/reception/queue", label: "Queue", icon: <CalendarIcon /> },
  { href: "/reception/patients", label: "Patients", icon: <UsersIcon /> },
  { href: "/reception/profile", label: "More", icon: <InfoIcon /> },
];

export function ReceptionBottomNav() {
  const pathname = usePathname();
  return <BottomNav items={items} activeHref={pathname} navLabel="Reception navigation" />;
}
