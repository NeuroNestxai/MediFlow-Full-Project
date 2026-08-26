import type { Service } from "@/types";

export const mockServices: Service[] = [
  {
    id: "svc-cleaning-whitening",
    name: "Cleaning & Whitening",
    specialty: "General Dentistry",
    ageGroup: "All Ages",
    description:
      "A routine dental cleaning to remove plaque and brighten your smile.",
  },
  {
    id: "svc-diabetes-followup",
    name: "Diabetes & Blood-Pressure Follow-up",
    specialty: "General & Chronic Care",
    ageGroup: "Adults",
    description: "A routine follow-up visit for ongoing chronic care management.",
  },
  {
    id: "svc-root-canal",
    name: "Root-Canal Treatment",
    specialty: "General Dentistry",
    ageGroup: "Adults",
    description: "Treatment for infected or damaged tooth pulp.",
  },
];

export function getServiceById(id: string): Service | undefined {
  return mockServices.find((s) => s.id === id);
}
