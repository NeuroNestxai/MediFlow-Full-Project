// Guided-tour step definitions for the Patient area. Targets reference stable
// `data-tour="…"` attributes rendered on real elements — never fragile CSS
// class selectors. Keep each tour to 3–6 short, useful steps.

export interface TourStep {
  /** Value of the target element's `data-tour` attribute. If the element is
   * absent at runtime the step is skipped gracefully. */
  target: string;
  title: string;
  body: string;
  /** Preferred placement of the popover relative to the target. The overlay
   * still flips/clamps to stay on-screen and off the target. */
  placement?: "top" | "bottom" | "left" | "right" | "auto";
}

export interface PageTour {
  /** Stable page key used for completion storage. */
  id: string;
  /** Bump when a page's tour content meaningfully changes so returning
   * patients can be shown the updated tour without wiping other preferences. */
  version: number;
  title: string;
  steps: TourStep[];
}

export const PATIENT_TOURS = {
  dashboard: {
    id: "patient-dashboard",
    version: 1,
    title: "Dashboard tour",
    steps: [
      {
        target: "patient-next-appointment",
        title: "Your next appointment",
        body: "Your upcoming visit shows here with the doctor, date, time and reference — plus quick actions like viewing details or its QR code.",
      },
      {
        target: "patient-ask-mediflow",
        title: "Ask MediFlow",
        body: "MediFlow helps you find services, doctors and appointments. It never diagnoses, prescribes, or handles emergencies.",
      },
      {
        target: "patient-quick-actions",
        title: "Quick actions",
        body: "Jump straight to booking, services, doctors or your appointments from here.",
      },
      {
        target: "patient-recent-notifications",
        title: "Recent notifications",
        body: "A preview of your latest updates. Open Notifications to see them all and mark them read.",
      },
      {
        target: "patient-help-tour",
        title: "Replay any tour",
        body: "Select “Tour this page” on any Patient screen to see this guidance again at any time.",
      },
    ],
  },
  "ai-assistant": {
    id: "patient-ai-assistant",
    version: 1,
    title: "Ask MediFlow tour",
    steps: [
      {
        target: "chat-history",
        title: "Your conversations",
        body: "Past conversations are saved to your account so you can reopen and continue them later.",
      },
      {
        target: "chat-new-conversation",
        title: "Start fresh",
        body: "New Conversation begins a clean chat with its own memory, separate from your other conversations.",
      },
      {
        target: "chat-messages",
        title: "The conversation",
        body: "Your messages appear on the right, MediFlow’s on the left. Long answers wrap and the latest stays in view.",
      },
      {
        target: "chat-composer",
        title: "Ask a question",
        body: "Type here and press Enter to send (Shift+Enter for a new line). Ask about MCC services, doctors or appointments.",
      },
      {
        target: "chat-actions",
        title: "Handy shortcuts",
        body: "Browse Services or reach Reception without leaving the conversation.",
      },
    ],
  },
  services: {
    id: "patient-services",
    version: 1,
    title: "Services tour",
    steps: [
      { target: "services-search", title: "Search services", body: "Type to find a service by name or keyword." },
      { target: "services-filters", title: "Filter", body: "Narrow the list by specialty and age group. Active filters show as chips you can clear." },
      { target: "services-results", title: "Service cards", body: "Each card explains the service in plain language and shows who it’s for." },
      { target: "services-view-doctors", title: "Find a doctor", body: "Select “View Doctors” to see clinicians who offer that service, then book." },
    ],
  },
  doctors: {
    id: "patient-doctors",
    version: 1,
    title: "Doctors tour",
    steps: [
      { target: "doctors-search", title: "Search by name", body: "Find a specific doctor quickly." },
      { target: "doctors-filters", title: "Filter", body: "Filter by specialty or gender to narrow the directory." },
      { target: "doctors-results", title: "Doctor cards", body: "See each doctor’s specialties and the services they offer." },
      { target: "doctors-actions", title: "Profile or book", body: "View a full profile, or go straight to booking." },
    ],
  },
  "doctor-profile": {
    id: "patient-doctor-profile",
    version: 1,
    title: "Doctor profile tour",
    steps: [
      { target: "profile-identity", title: "About this doctor", body: "Their specialties and the MCC services they’re mapped to." },
      { target: "profile-book", title: "Book with this doctor", body: "Start a booking pre-set to this doctor." },
    ],
  },
  booking: {
    id: "patient-booking",
    version: 1,
    title: "Booking tour",
    steps: [
      { target: "booking-steps", title: "Six simple steps", body: "Choose a service, doctor, date and time, then review and confirm." },
      { target: "booking-summary", title: "Your selections", body: "Your choices stay visible here as you go, so you can always see what you’re booking." },
      { target: "booking-availability-note", title: "Availability", body: "Times shown are example availability, not an official MCC schedule." },
    ],
  },
  appointments: {
    id: "patient-appointments",
    version: 1,
    title: "Appointments tour",
    steps: [
      { target: "appts-tabs", title: "Upcoming, completed, cancelled", body: "Switch tabs to see appointments by stage. Checked-out visits appear under Completed." },
      { target: "appts-list", title: "Appointment cards", body: "Each shows the status, doctor, service, date, time and reference." },
      { target: "appts-actions", title: "Actions", body: "Where allowed you can view details, show the QR, reschedule, or cancel." },
    ],
  },
  qr: {
    id: "patient-qr",
    version: 1,
    title: "Appointment details tour",
    steps: [
      { target: "qr-code", title: "Your check-in QR", body: "The QR contains only your booking reference — no medical or personal information." },
      { target: "qr-timeline", title: "Status timeline", body: "Follow your visit’s stages from booked through checkout." },
    ],
  },
  notifications: {
    id: "patient-notifications",
    version: 1,
    title: "Notifications tour",
    steps: [
      { target: "notif-filters", title: "All or unread", body: "Filter to focus on what you haven’t read yet." },
      { target: "notif-mark-all", title: "Mark all read", body: "Clear your unread count in one action." },
      { target: "notif-list", title: "Your updates", body: "Grouped by Today, Yesterday and Earlier. Unread items are marked with more than just colour." },
    ],
  },
  profile: {
    id: "patient-profile",
    version: 1,
    title: "Profile tour",
    steps: [
      { target: "profile-sections", title: "Organised sections", body: "Your personal info, patient-reported health, documents, accessibility and account settings." },
      { target: "profile-health", title: "Patient-reported health", body: "Allergies and medications you enter yourself. This is not clinically verified and is not a diagnosis." },
      { target: "profile-account", title: "Account", body: "Manage your password and sign out here." },
    ],
  },
  documents: {
    id: "patient-documents",
    version: 1,
    title: "Documents tour",
    steps: [
      { target: "docs-upload", title: "Upload files", body: "Add your own documents. Supported types and the size limit are shown here." },
      { target: "docs-list", title: "Your documents", body: "Files are labelled as patient-uploaded or clinic-provided, with their date." },
    ],
  },
  accessibility: {
    id: "patient-accessibility",
    version: 1,
    title: "Accessibility tour",
    steps: [
      { target: "a11y-color", title: "Colour vision modes", body: "Choose the palette that works best for you across all of MediFlow." },
      { target: "a11y-toggles", title: "Text & motion", body: "Turn on Large Text or Reduced Motion. These apply on this device." },
      { target: "a11y-reset", title: "Reset", body: "Return every setting to its default at any time." },
    ],
  },
  "follow-up": {
    id: "patient-follow-up",
    version: 1,
    title: "Follow-up tour",
    steps: [
      { target: "followup-list", title: "Approved follow-ups", body: "Only follow-up instructions a doctor has approved appear here — nothing is shown until then." },
    ],
  },
} as const satisfies Record<string, PageTour>;

export type PatientTourKey = keyof typeof PATIENT_TOURS;
