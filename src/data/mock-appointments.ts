import type { Appointment } from "@/types";

export const mockAppointments: Appointment[] = [
  {
    id: "appt-1",
    reference: "REF-20260007",
    patientName: "Ahmed Salim Al Balushi",
    preferredName: "Ahmed",
    doctorId: "doc-abbas-pakkyara",
    serviceId: "svc-cleaning-whitening",
    date: "2026-07-26",
    time: "8:00 AM",
    status: "checked-in",
  },
  {
    id: "appt-2",
    reference: "REF-20260012",
    patientName: "Fatima Nasser Al Harthy",
    preferredName: "Fatima",
    doctorId: "doc-khawla-al-hotti",
    serviceId: "svc-root-canal",
    date: "2026-07-26",
    time: "9:00 AM",
    status: "waiting",
  },
  {
    id: "appt-3",
    reference: "REF-20260001",
    patientName: "Maryam Rashid Harib Al Farsi",
    preferredName: "Maryam",
    doctorId: "doc-abbas-pakkyara",
    serviceId: "svc-diabetes-followup",
    date: "2026-07-26",
    time: "10:00 AM",
    status: "confirmed",
  },
];

export function getAppointmentsForDoctor(doctorId: string): Appointment[] {
  return mockAppointments.filter((a) => a.doctorId === doctorId);
}
