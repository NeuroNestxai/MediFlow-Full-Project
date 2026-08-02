"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { CalendarIcon, InfoIcon, StethoscopeIcon } from "@/components/ui/Icons";

const items = [
  { href: "/patient/dashboard", label: "Home", icon: <InfoIcon /> },
  { href: "/patient/ai-assistant", label: "Ask", icon: <InfoIcon /> },
  { href: "/patient/appointments", label: "Visits", icon: <CalendarIcon /> },
  { href: "/patient/doctors", label: "Doctors", icon: <StethoscopeIcon /> },
  { href: "/patient/profile", label: "More", icon: <InfoIcon /> },
];

export function PatientBottomNav() {
  const pathname = usePathname();
  return <BottomNav items={items} activeHref={pathname} navLabel="Patient navigation" />;
}
