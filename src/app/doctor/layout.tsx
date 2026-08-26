"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { DesktopTopNav } from "@/components/layout/DesktopTopNav";
import { MobileBrandBar } from "@/components/layout/MobileBrandBar";
import { DoctorBottomNav } from "@/components/layout/DoctorBottomNav";
import { useStaffUnreadCount } from "@/hooks/useStaffUnreadCount";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const unread = useStaffUnreadCount();

  useEffect(() => {
    document.documentElement.setAttribute("data-role-theme", "doctor");
    return () => document.documentElement.removeAttribute("data-role-theme");
  }, []);

  const links = [
    { href: "/doctor/dashboard", label: "Dashboard" },
    { href: "/doctor/schedule", label: "Schedule" },
    { href: "/doctor/availability", label: "Availability" },
    { href: "/doctor/patients", label: "Patients" },
    { href: "/doctor/appointments", label: "Appointments" },
    { href: "/doctor/consultation-notes", label: "Notes" },
    { href: "/doctor/follow-ups", label: "Follow-Ups" },
    { href: "/doctor/notifications", label: "Notifications", badge: unread },
    { href: "/doctor/profile", label: "Profile" },
  ];
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
