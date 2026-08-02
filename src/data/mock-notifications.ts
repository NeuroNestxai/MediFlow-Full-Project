import type { NotificationItem, QueueEntry } from "@/types";

export const mockNotifications: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Appointment confirmed",
    body: "Your appointment with Dr. Abbas Pakkyara is confirmed for today at 8:00 AM.",
    timestamp: "Today · 07:10 AM",
    read: false,
  },
  {
    id: "notif-2",
    title: "Upcoming appointment reminder",
    body: "Your visit is coming up in a few hours. Please arrive 10 minutes early.",
    timestamp: "Today · 06:00 AM",
    read: false,
  },
  {
    id: "notif-3",
    title: "Follow-up available",
    body: "Your doctor has approved follow-up instructions from a previous visit.",
    timestamp: "Yesterday",
    read: true,
  },
];

export const mockQueue: QueueEntry[] = [
  {
    id: "queue-1",
    patientName: "Ahmed Salim Al Balushi",
    doctorName: "Dr. Abbas Pakkyara",
    time: "8:00 AM",
    status: "checked-in",
  },
  {
    id: "queue-2",
    patientName: "Fatima Nasser Al Harthy",
    doctorName: "Dr. Khawla Al Hotti",
    time: "9:00 AM",
    status: "waiting",
  },
  {
    id: "queue-3",
    patientName: "Yousuf Khalid Al Riyami",
    doctorName: "Dr. Fadi Mosa",
    time: "9:30 AM",
    status: "in-consultation",
  },
];
