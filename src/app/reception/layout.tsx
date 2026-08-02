"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DesktopTopNav } from "@/components/layout/DesktopTopNav";
import { ReceptionBottomNav } from "@/components/layout/ReceptionBottomNav";

const links = [
  { href: "/reception/dashboard", label: "Dashboard" },
  { href: "/reception/qr-scan", label: "Mobile QR" },
  { href: "/reception/queue", label: "Live Queue" },
  { href: "/reception/appointments", label: "Appointments" },
  { href: "/reception/patients", label: "Patients" },
  { href: "/reception/doctors", label: "Doctors" },
  { href: "/reception/notifications", label: "Notifications" },
];

export default function ReceptionLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <DesktopTopNav
        links={links}
        activeHref={pathname}
        roleTag="Reception View"
        homeHref="/reception/dashboard"
      />
      <main>{children}</main>
      <ReceptionBottomNav />
    </div>
  );
}
