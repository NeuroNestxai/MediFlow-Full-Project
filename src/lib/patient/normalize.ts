import type {
  DirectoryService,
  DirectoryDoctor,
  PatientAppointment,
  AvailableSlot,
  Specialty,
  DbAppointmentStatus,
  SlotOffer,
} from "./types";

// Shared PostgREST select strings so client + server queries stay in sync.
export const SPECIALTY_SELECT = "id, name";
export const SERVICE_SELECT =
  "id, slug, name, description, age_group, specialty_id, specialty:specialties(name)";
// Doctors embed specialties through the doctor_specialties junction (the
// authoritative source). We deliberately do NOT embed specialties directly off
// doctors.specialty_id — that path is now ambiguous with the junction and makes
// PostgREST return PGRST201. specialty_id is kept only as a scalar fallback flag.
export const DOCTOR_SELECT =
  "id, slug, full_name, gender, portrait_palette, specialty_id, doctor_specialties(specialty:specialties(id, name)), doctor_services(service:services(id, name, slug))";
export const APPOINTMENT_SELECT =
  "id, reference, appointment_date, appointment_time, status, doctor_id, service_id, wants_earlier, doctor:doctors(full_name), service:services(name)";

/** Columns of the public.dashboard_my_slot_offers view (RLS-scoped to the caller). */
export const SLOT_OFFER_SELECT =
  "offer_id, offer_date, offer_time, status, expires_at, my_reference, my_current_date, my_current_time, doctor_name";

// Embedded to-one relations can arrive as an object or a single-item array
// depending on PostgREST inference; normalize both.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface NamedRow {
  name: string;
}
interface IdNameRow {
  id: string;
  name: string;
}
interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  age_group: string | null;
  specialty_id: string | null;
  specialty: NamedRow | NamedRow[] | null;
}
interface ServiceLite {
  id: string;
  name: string;
  slug: string;
}
interface DoctorServiceRow {
  service: ServiceLite | ServiceLite[] | null;
}
interface DoctorSpecialtyRow {
  specialty: IdNameRow | IdNameRow[] | null;
}
interface DoctorRow {
  id: string;
  slug: string;
  full_name: string;
  gender: string | null;
  portrait_palette: number | null;
  specialty_id: string | null;
  doctor_specialties: DoctorSpecialtyRow[] | null;
  doctor_services: DoctorServiceRow[] | null;
}
interface AppointmentRow {
  id: string;
  reference: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  doctor_id: string;
  service_id: string;
  wants_earlier: boolean | null;
  doctor: { full_name: string } | { full_name: string }[] | null;
  service: NamedRow | NamedRow[] | null;
}

interface SlotOfferRow {
  offer_id: string;
  offer_date: string;
  offer_time: string;
  status: string;
  expires_at: string;
  my_reference: string;
  my_current_date: string;
  my_current_time: string;
  doctor_name: string | null;
}
interface SlotRow {
  availability_id: string;
  available_date: string;
  start_time: string;
  is_demo?: boolean | null;
  source_label?: string | null;
}

export function normalizeSpecialty(row: unknown): Specialty {
  const r = row as IdNameRow;
  return { id: r.id, name: r.name };
}

export function normalizeSpecialties(data: unknown): Specialty[] {
  return ((data ?? []) as IdNameRow[]).map((r) => normalizeSpecialty(r));
}

export function normalizeService(row: unknown): DirectoryService {
  const r = row as ServiceRow;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
    ageGroup: r.age_group ?? null,
    specialtyId: r.specialty_id ?? null,
    specialtyName: one(r.specialty)?.name ?? null,
  };
}

export function normalizeServices(data: unknown): DirectoryService[] {
  return ((data ?? []) as ServiceRow[]).map((r) => normalizeService(r));
}

export function normalizeDoctor(row: unknown): DirectoryDoctor {
  const r = row as DoctorRow;
  const services = (r.doctor_services ?? [])
    .map((ds) => one(ds.service))
    .filter((s): s is ServiceLite => Boolean(s))
    .map((s) => ({ id: s.id, name: s.name, slug: s.slug }));
  // Authoritative specialties from the junction; safe for zero/one/many/null.
  const specialties = (r.doctor_specialties ?? [])
    .map((ds) => one(ds.specialty))
    .filter((s): s is IdNameRow => Boolean(s && s.id && s.name))
    .map((s) => ({ id: s.id, name: s.name }));
  return {
    id: r.id,
    slug: r.slug,
    fullName: r.full_name,
    gender: r.gender ?? null,
    portraitPalette: r.portrait_palette ?? null,
    specialties,
    services,
  };
}

export function normalizeDoctors(data: unknown): DirectoryDoctor[] {
  return ((data ?? []) as DoctorRow[]).map((r) => normalizeDoctor(r));
}

export function normalizeAppointment(row: unknown): PatientAppointment {
  const r = row as AppointmentRow;
  return {
    id: r.id,
    reference: r.reference,
    date: r.appointment_date,
    time: r.appointment_time,
    status: r.status as DbAppointmentStatus,
    doctorId: r.doctor_id,
    serviceId: r.service_id,
    doctorName: one(r.doctor)?.full_name ?? null,
    serviceName: one(r.service)?.name ?? null,
    wantsEarlier: r.wants_earlier ?? false,
  };
}

export function normalizeAppointments(data: unknown): PatientAppointment[] {
  return ((data ?? []) as AppointmentRow[]).map((r) => normalizeAppointment(r));
}

export function normalizeSlotOffer(row: unknown): SlotOffer {
  const r = row as SlotOfferRow;
  return {
    offerId: r.offer_id,
    offerDate: r.offer_date,
    offerTime: r.offer_time,
    status: r.status,
    expiresAt: r.expires_at,
    myReference: r.my_reference,
    myCurrentDate: r.my_current_date,
    myCurrentTime: r.my_current_time,
    doctorName: r.doctor_name,
  };
}

export function normalizeSlotOffers(data: unknown): SlotOffer[] {
  return ((data ?? []) as SlotOfferRow[]).map((r) => normalizeSlotOffer(r));
}

export function normalizeSlots(data: unknown): AvailableSlot[] {
  return ((data ?? []) as SlotRow[]).map((r) => ({
    availabilityId: r.availability_id,
    date: r.available_date,
    time: r.start_time,
    isDemo: r.is_demo ?? false,
    sourceLabel: r.source_label ?? null,
  }));
}
