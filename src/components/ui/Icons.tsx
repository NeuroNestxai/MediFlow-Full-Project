import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 8.4 L6 12 L13.5 3.5" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5 V8 L10.5 9.8" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7 V11.3" />
      <circle cx="8" cy="4.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ErrorIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3 L13 13 M13 3 L3 13" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9 C4 6.2 5.8 4.2 8 4.2 C10.2 4.2 12 6.2 12 9 C12 11.5 12.8 12 12.8 12 H3.2 S4 11.5 4 9 Z" />
      <path d="M6.6 13.2 C6.6 13.9 7.2 14.5 8 14.5 C8.8 14.5 9.4 13.9 9.4 13.2" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 1.6 L15 14.4 H1 Z" />
      <path d="M8 6.4 V10" />
      <circle cx="8" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 7.2 V5.3 C4.5 3.5 6 2 8 2 C10 2 11.5 3.5 11.5 5.3 V7.2" />
      <path d="M3.5 7.2 H12.5 V13.5 H3.5 Z" />
    </svg>
  );
}

export function WifiOffIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 2.5 L13.5 13.5" />
      <path d="M4.3 7.4 C5.5 6.3 7 5.7 8 5.7 M10.7 6.6 C11.4 6.8 12.1 7.2 12.7 7.7 M6.3 9.7 C6.9 9.2 7.4 9 8 9 M8 12.1 V12.2" />
    </svg>
  );
}

export function CameraOffIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 2.5 L13.5 13.5" />
      <path d="M5 5 H3.5 V12.5 H12 M7.2 5 L8.5 3.5 H10.8 L12 5 H12.8 V9.5" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="6.8" cy="6.8" r="4.3" />
      <path d="M10 10 L13.5 13.5" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 3 L5 8 L10 13" />
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 2 C9.4 2 10.5 3.1 10.5 4.5 V8 C10.5 9.4 9.4 10.5 8 10.5 C6.6 10.5 5.5 9.4 5.5 8 V4.5 C5.5 3.1 6.6 2 8 2 Z" />
      <path d="M4.3 8 C4.3 10.3 6 12 8 12 C10 12 11.7 10.3 11.7 8 M8 12 V14" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 4.5 H13 V13.5 H3 Z" />
      <path d="M3 7 H13 M5.5 2.5 V5 M10.5 2.5 V5" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="6.2" cy="6" r="2.2" />
      <path d="M2.2 13 C2.9 10.5 4.4 9.2 6.2 9.2 C8 9.2 9.5 10.5 10.2 13" />
      <path d="M10.5 9.6 C11.8 9.8 12.7 10.7 13.2 12.5" />
      <circle cx="11" cy="6.4" r="1.7" />
    </svg>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.2 C6.2 5.1 7 4.4 8 4.4 C9 4.4 9.8 5.1 9.8 6 C9.8 7.2 8 7.2 8 8.6" />
      <circle cx="8" cy="11.1" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AccessibilityIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="3.1" r="1.25" fill="currentColor" stroke="none" />
      <path d="M2.6 5.6 C4 6.3 6 6.7 8 6.7 C10 6.7 12 6.3 13.4 5.6" />
      <path d="M8 6.4 V10 M8 10 L5.5 14 M8 10 L10.5 14" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M1.5 8 C3 4.6 5.4 3.1 8 3.1 C10.6 3.1 13 4.6 14.5 8 C13 11.4 10.6 12.9 8 12.9 C5.4 12.9 3 11.4 1.5 8 Z" />
      <circle cx="8" cy="8" r="2.1" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 2.5 L13.5 13.5" />
      <path d="M6.3 3.5 C6.8 3.4 7.4 3.3 8 3.3 C10.6 3.3 13 4.8 14.5 8.2 C14 9.2 13.4 10.1 12.6 10.8" />
      <path d="M9.9 10.6 C9.3 10.8 8.7 10.9 8 10.9 C5.4 10.9 3 9.4 1.5 8.2 C2.1 6.7 3.1 5.6 4.3 4.9" />
      <path d="M6.6 6.8 A2 2 0 0 0 9.3 9.5" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 7.3 L8 3 L13.5 7.3" />
      <path d="M4 6.5 V13 H12 V6.5" />
      <path d="M6.3 13 V9.5 H9.7 V13" />
    </svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 4 H13.5 V10.5 H6.5 L4 12.8 V10.5 H2.5 Z" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 4.5 H13.5 M2.5 8 H13.5 M2.5 11.5 H13.5" />
    </svg>
  );
}

export function StethoscopeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 2.5 V6.5 C4.5 8.4 6 9.8 7.7 9.8 C9.4 9.8 10.8 8.4 10.8 6.5 V2.5" />
      <path d="M3.2 2.5 H5.8 M9.5 2.5 H12.1" />
      <circle cx="12.4" cy="9.8" r="1.4" />
    </svg>
  );
}
