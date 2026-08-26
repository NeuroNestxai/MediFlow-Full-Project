import type { Doctor } from "@/types";

// MCC-confirmed doctor names and specialties, kept consistent with the
// Figma prototype. Portraits are synthetic placeholders — see
// components/ui/DoctorPortrait.tsx — never real photographs.
export const mockDoctors: Doctor[] = [
  {
    id: "doc-abbas-pakkyara",
    name: "Dr. Abbas Pakkyara",
    specialty: "General & Chronic Care",
    gender: "Male",
    services: ["Diabetes Care", "Chronic Follow-up", "General Consultation"],
    portraitPalette: 1,
    nextAvailable: "Mon, 27 Jul · 9:00 AM",
    availability: "With Patient",
  },
  {
    id: "doc-khawla-al-hotti",
    name: "Dr. Khawla Al Hotti",
    specialty: "General Dentistry",
    gender: "Female",
    services: ["Cleaning & Whitening", "Root-canal Treatment"],
    portraitPalette: 2,
    nextAvailable: "Mon, 27 Jul · 10:00 AM",
    availability: "Available",
  },
  {
    id: "doc-fadi-mosa",
    name: "Dr. Fadi Mosa",
    specialty: "Orthodontics",
    gender: "Male",
    services: ["Gum Treatment", "General Consultation"],
    portraitPalette: 3,
    nextAvailable: "Mon, 27 Jul · 11:00 AM",
    availability: "Available",
  },
];

export function getDoctorById(id: string): Doctor | undefined {
  return mockDoctors.find((d) => d.id === id);
}
