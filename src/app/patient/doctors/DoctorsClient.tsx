"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DoctorDirectoryCard } from "@/components/patient/DoctorDirectoryCard";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { Button } from "@/components/ui/Button";
import { fetchDoctors, fetchSpecialties } from "@/lib/patient/client-data";
import { PROTOTYPE_MAPPING_NOTICE } from "@/lib/patient/types";
import type { DirectoryDoctor, Specialty } from "@/lib/patient/types";
import styles from "./page.module.css";
import controls from "@/components/patient/directory.module.css";

const GENDER_OPTIONS = ["All genders", "Male", "Female"] as const;
const INITIAL = 9;
const STEP = 9;

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; doctors: DirectoryDoctor[]; specialties: Specialty[] };

export function DoctorsClient({ serviceId }: { serviceId: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [specialtyId, setSpecialtyId] = useState<string>("all");
  const [gender, setGender] = useState<(typeof GENDER_OPTIONS)[number]>("All genders");
  const [visible, setVisible] = useState(INITIAL);

  useEffect(() => {
    let active = true;
    Promise.all([fetchDoctors(), fetchSpecialties()])
      .then(([doctors, specialties]) => {
        if (active) setState({ status: "ready", doctors, specialties });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function retry() {
    setState({ status: "loading" });
    setReloadKey((k) => k + 1);
  }

  function onQuery(v: string) {
    setQuery(v);
    setVisible(INITIAL);
  }
  function onSpecialty(v: string) {
    setSpecialtyId(v);
    setVisible(INITIAL);
  }
  function onGender(v: (typeof GENDER_OPTIONS)[number]) {
    setGender(v);
    setVisible(INITIAL);
  }
  function clearAll() {
    setQuery("");
    setSpecialtyId("all");
    setGender("All genders");
    setVisible(INITIAL);
    if (serviceId) router.push("/patient/doctors");
  }

  const serviceName = useMemo(() => {
    if (!serviceId || state.status !== "ready") return null;
    for (const d of state.doctors) {
      const m = d.services.find((s) => s.id === serviceId);
      if (m) return m.name;
    }
    return null;
  }, [state, serviceId]);

  const specialtyName = useMemo(() => {
    if (specialtyId === "all" || state.status !== "ready") return null;
    return state.specialties.find((s) => s.id === specialtyId)?.name ?? null;
  }, [state, specialtyId]);

  const filtered = useMemo(() => {
    if (state.status !== "ready") return [];
    const q = query.trim().toLowerCase();
    return state.doctors.filter((d) => {
      if (serviceId && !d.services.some((s) => s.id === serviceId)) return false;
      if (specialtyId !== "all" && !d.specialties.some((s) => s.id === specialtyId)) return false;
      if (gender !== "All genders" && d.gender !== gender) return false;
      if (q && !d.fullName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [state, serviceId, specialtyId, gender, query]);

  const hasFilters = Boolean(serviceId) || specialtyId !== "all" || gender !== "All genders" || query.trim() !== "";
  const ready = state.status === "ready";
  const shown = filtered.slice(0, visible);

  function bookHref(doctorId: string): string {
    const params = new URLSearchParams();
    if (serviceId) params.set("serviceId", serviceId);
    params.set("doctorId", doctorId);
    return `/patient/booking?${params.toString()}`;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Meet Our Doctors</h1>
      <p className={styles.subtitle}>
        {serviceId
          ? `Doctors offering ${serviceName ?? "the selected service"}.`
          : "Confirmed MCC doctor names, shown with prototype portraits."}
      </p>

      <p className={controls.notice}>{PROTOTYPE_MAPPING_NOTICE}</p>

      <div className={controls.controls}>
        <div className={controls.row}>
          <label className="sr-only" htmlFor="doctor-search">
            Search doctors by name
          </label>
          <input
            id="doctor-search"
            className={controls.search}
            placeholder="Search doctors by name…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            type="search"
            disabled={!ready}
          />

          <label className="sr-only" htmlFor="doctor-specialty">
            Filter by specialty
          </label>
          <select
            id="doctor-specialty"
            className={controls.select}
            value={specialtyId}
            onChange={(e) => onSpecialty(e.target.value)}
            disabled={!ready}
          >
            <option value="all">All specialties</option>
            {ready &&
              state.specialties.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
          </select>
        </div>

        <div className={controls.row} role="group" aria-label="Filter by gender">
          {GENDER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`${controls.chip} ${gender === option ? controls.chipActive : ""}`}
              aria-pressed={gender === option}
              onClick={() => onGender(option)}
              disabled={!ready}
            >
              {option}
            </button>
          ))}
        </div>

        {hasFilters && (
          <div className={controls.summary}>
            <span>Filters:</span>
            {serviceId && <span className={controls.summaryTag}>Service: {serviceName ?? "selected"}</span>}
            {specialtyName && <span className={controls.summaryTag}>Specialty: {specialtyName}</span>}
            {gender !== "All genders" && <span className={controls.summaryTag}>{gender}</span>}
            {query.trim() && <span className={controls.summaryTag}>“{query.trim()}”</span>}
            <button type="button" className={controls.clearAll} onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {state.status === "loading" && <LoadingState label="Loading doctors…" />}
      {state.status === "error" && <ErrorState onRetry={retry} />}
      {ready && filtered.length === 0 && (
        <EmptyState
          title="No doctors match your filters"
          body="Try a different search, specialty, or gender selection."
        />
      )}
      {ready && filtered.length > 0 && (
        <>
          <p className={controls.count}>
            Showing {shown.length} of {filtered.length} doctors
          </p>
          <div className={styles.grid}>
            {shown.map((doctor) => (
              <DoctorDirectoryCard
                key={doctor.id}
                doctor={doctor}
                onViewProfile={() => router.push(`/patient/doctors/${doctor.id}`)}
                onBook={() => router.push(bookHref(doctor.id))}
              />
            ))}
          </div>
          {visible < filtered.length && (
            <div className={controls.loadMoreRow}>
              <Button variant="secondary" onClick={() => setVisible((v) => v + STEP)}>
                Show More Doctors
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
