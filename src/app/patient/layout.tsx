"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DesktopTopNav } from "@/components/layout/DesktopTopNav";
import { MobileBrandBar } from "@/components/layout/MobileBrandBar";
import { PatientBottomNav } from "@/components/layout/PatientBottomNav";
import { TourProvider } from "@/components/tour/TourProvider";
import { fetchUnreadCount } from "@/lib/patient/client-data";

export default function PatientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Refresh the unread badge on navigation (0 until notifications are enabled).
  useEffect(() => {
    let active = true;
    fetchUnreadCount()
      .then((c) => {
        if (active) setUnread(c);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  const links = [
    { href: "/patient/dashboard", label: "Home" },
    { href: "/patient/ai-assistant", label: "Ask MediFlow" },
    { href: "/patient/voice", label: "Voice" },
    { href: "/patient/services", label: "Services" },
    { href: "/patient/doctors", label: "Doctors" },
    { href: "/patient/appointments", label: "Appointments" },
    { href: "/patient/notifications", label: "Notifications", badge: unread },
    { href: "/patient/profile", label: "Profile" },
  ];

  return (
    <TourProvider>
      <DesktopTopNav links={links} activeHref={pathname} homeHref="/patient/dashboard" />
      <MobileBrandBar homeHref="/patient/dashboard" />
      <main>{children}</main>
      <PatientBottomNav />
    </TourProvider>
  );
}
