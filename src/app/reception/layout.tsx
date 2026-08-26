"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { DesktopTopNav } from "@/components/layout/DesktopTopNav";
import { MobileBrandBar } from "@/components/layout/MobileBrandBar";
import { ReceptionBottomNav } from "@/components/layout/ReceptionBottomNav";
import { useStaffUnreadCount } from "@/hooks/useStaffUnreadCount";

export default function ReceptionLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const unread = useStaffUnreadCount();

  useEffect(() => {
    document.documentElement.setAttribute("data-role-theme", "reception");
    return () => document.documentElement.removeAttribute("data-role-theme");
  }, []);

  const links = [
    { href: "/reception/dashboard", label: "Dashboard" },
    { href: "/reception/check-in", label: "Check-In" },
    { href: "/reception/queue", label: "Live Queue" },
    { href: "/reception/appointments", label: "Appointments" },
    { href: "/reception/booking", label: "Booking" },
    { href: "/reception/patients", label: "Patients" },
    { href: "/reception/doctors", label: "Doctors" },
    { href: "/reception/notifications", label: "Notifications", badge: unread },
    { href: "/reception/profile", label: "Profile" },
  ];
  return (
    <div>
      <DesktopTopNav
        links={links}
        activeHref={pathname}
        roleTag="Reception View"
        homeHref="/reception/dashboard"
      />
      <MobileBrandBar homeHref="/reception/dashboard" />
      <main>{children}</main>
      <ReceptionBottomNav />
    </div>
  );
}
