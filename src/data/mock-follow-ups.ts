import type { InfoSource } from "@/types";

export interface FollowUp {
  id: string;
  title: string;
  instructions: string;
  source: InfoSource;
  dueDate: string;
  doctorName: string;
  completed: boolean;
}

// Doctor-approved follow-up instructions only — never AI-generated or
// invented. This mirrors the Figma rule that follow-up guidance always
// carries a "Doctor-approved" source label.
export const mockFollowUps: FollowUp[] = [
  {
    id: "followup-1",
    title: "Blood-pressure recheck",
    instructions: "Continue current routine and recheck blood pressure in 4 weeks.",
    source: "doctor-approved",
    dueDate: "2026-08-23",
    doctorName: "Dr. Abbas Pakkyara",
    completed: false,
  },
];
