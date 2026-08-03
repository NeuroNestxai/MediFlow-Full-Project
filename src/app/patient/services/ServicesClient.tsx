"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ServiceDirectoryCard } from "@/components/patient/ServiceDirectoryCard";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import { Button } from "@/components/ui/Button";
import { SearchIcon } from "@/components/ui/Icons";
import { PatientPage, PatientPageHeader } from "@/components/patient/PatientPage";
import { PATIENT_TOURS } from "@/components/tour/tours";
import { fetchServices, fetchSpecialties } from "@/lib/patient/client-data";
import type { DirectoryService, Specialty } from "@/lib/patient/types";
import styles from "./page.module.css";
import controls from "@/components/patient/directory.module.css";

const INITIAL = 12;
const STEP = 12;
const AGE_OPTIONS = ["All ages", "Adult", "Child"] as const;

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; services: DirectoryService[]; specialties: Specialty[] };

export function ServicesClient() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [specialtyId, setSpecialtyId] = useState<string>("all");
  const [age, setAge] = useState<(typeof AGE_OPTIONS)[number]>("All ages");
  const [visible, setVisible] = useState(INITIAL);

  useEffect(() => {
    let active = true;
    Promise.all([fetchServices(), fetchSpecialties()])
      .then(([services, specialties]) => {
        if (active) setState({ status: "ready", services, specialties });
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

  // Reset pagination whenever the filters change (done in handlers, not effects).
  function onQuery(v: string) {
    setQuery(v);
    setVisible(INITIAL);
  }
  function onSpecialty(v: string) {
    setSpecialtyId(v);
    setVisible(INITIAL);
  }
  function onAge(v: (typeof AGE_OPTIONS)[number]) {
    setAge(v);
    setVisible(INITIAL);
  }
  function clearFilters() {
    setQuery("");
    setSpecialtyId("all");
    setAge("All ages");
    setVisible(INITIAL);
  }

  const specialtyName =
    state.status === "ready"
      ? (state.specialties.find((s) => s.id === specialtyId)?.name ?? null)
      : null;
  const hasFilters = query.trim() !== "" || specialtyId !== "all" || age !== "All ages";

  const filtered = useMemo(() => {
    if (state.status !== "ready") return [];
    const q = query.trim().toLowerCase();
    return state.services.filter((s) => {
      if (specialtyId !== "all" && s.specialtyId !== specialtyId) return false;
      if (age !== "All ages") {
        const g = (s.ageGroup ?? "").toLowerCase();
        if (g !== age.toLowerCase() && g !== "all") return false;
      }
      if (q) {
        return (
          s.name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q) ||
          (s.specialtyName ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state, query, specialtyId, age]);

  const ready = state.status === "ready";
  const shown = filtered.slice(0, visible);

  return (
    <PatientPage width="wide">
      <PatientPageHeader
        title="MCC Services"
        description="Explore confirmed MCC services in plain language, then find a doctor who offers them."
        tour={PATIENT_TOURS.services}
      />

      <div className={controls.controls}>
        <div className={controls.row}>
          <div className={controls.searchWrap} data-tour="services-search">
            <SearchIcon aria-hidden="true" className={controls.searchIcon} />
            <label className="sr-only" htmlFor="service-search">
              Search services
            </label>
            <input
              id="service-search"
              className={controls.search}
              placeholder="Search services…"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              type="search"
              disabled={!ready}
            />
          </div>

          <div className={controls.filterGroup} data-tour="services-filters">
            <label className="sr-only" htmlFor="service-specialty">
              Filter by specialty
            </label>
            <select
              id="service-specialty"
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

            <label className="sr-only" htmlFor="service-age">
              Filter by age group
            </label>
            <select
              id="service-age"
              className={controls.select}
              value={age}
              onChange={(e) => onAge(e.target.value as (typeof AGE_OPTIONS)[number])}
              disabled={!ready}
            >
              {AGE_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasFilters ? (
          <div className={controls.summary}>
            <span>Active filters:</span>
            {query.trim() ? <span className={controls.summaryTag}>“{query.trim()}”</span> : null}
            {specialtyName ? <span className={controls.summaryTag}>{specialtyName}</span> : null}
            {age !== "All ages" ? <span className={controls.summaryTag}>{age}</span> : null}
            <button type="button" className={controls.clearAll} onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {state.status === "loading" && <LoadingState label="Loading services…" />}
      {state.status === "error" && <ErrorState onRetry={retry} />}
      {ready && filtered.length === 0 && (
        <EmptyState
          icon={<SearchIcon />}
          title="No services match your filters"
          body="Try a different search term, specialty, or age group."
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}
      {ready && filtered.length > 0 && (
        <>
          <p className={controls.count} aria-live="polite">
            Showing {shown.length} of {filtered.length} services
          </p>
          <div className={styles.grid} data-tour="services-results">
            {shown.map((service, i) => (
              <div key={service.id} data-tour={i === 0 ? "services-view-doctors" : undefined}>
                <ServiceDirectoryCard
                  service={service}
                  onViewDoctors={() => router.push(`/patient/doctors?serviceId=${service.id}`)}
                />
              </div>
            ))}
          </div>
          {visible < filtered.length && (
            <div className={controls.loadMoreRow}>
              <Button variant="secondary" onClick={() => setVisible((v) => v + STEP)}>
                Show More Services
              </Button>
            </div>
          )}
        </>
      )}
    </PatientPage>
  );
}
