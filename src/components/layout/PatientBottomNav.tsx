"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { CalendarIcon, HomeIcon, ChatIcon, MenuIcon, StethoscopeIcon } from "@/components/ui/Icons";

const items = [
  { href: "/patient/dashboard", label: "Home", icon: <HomeIcon /> },
  { href: "/patient/ai-assistant", label: "Ask", icon: <ChatIcon /> },
  { href: "/patient/appointments", label: "Visits", icon: <CalendarIcon /> },
  { href: "/patient/doctors", label: "Doctors", icon: <StethoscopeIcon /> },
  { href: "/patient/profile", label: "More", icon: <MenuIcon /> },
];

export function PatientBottomNav() {
  const pathname = usePathname();
  return <BottomNav items={items} activeHref={pathname} navLabel="Patient navigation" />;
}
