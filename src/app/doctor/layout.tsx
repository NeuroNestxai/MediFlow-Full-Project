"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DesktopTopNav } from "@/components/layout/DesktopTopNav";
import { MobileBrandBar } from "@/components/layout/MobileBrandBar";
import { DoctorBottomNav } from "@/components/layout/DoctorBottomNav";

const links = [
  { href: "/doctor/dashboard", label: "Dashboard" },
  { href: "/doctor/schedule", label: "Schedule" },
  { href: "/doctor/patients", label: "Patients" },
  { href: "/doctor/appointments", label: "Appointments" },
  { href: "/doctor/follow-ups", label: "Follow-Ups" },
  { href: "/doctor/notifications", label: "Notifications" },
  { href: "/doctor/profile", label: "Profile" },
];

export default function DoctorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <DesktopTopNav
        links={links}
        activeHref={pathname}
        roleTag="Clinician"
        homeHref="/doctor/dashboard"
      />
      <MobileBrandBar homeHref="/doctor/dashboard" />
      <main>{children}</main>
      <DoctorBottomNav />
    </div>
  );
}
