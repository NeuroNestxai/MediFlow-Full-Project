"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Toast } from "@/components/ui/Toast";
import { LoadingState, EmptyState, ErrorState } from "@/components/states/StatePanel";
import {
  fetchDocuments,
  uploadDocument,
  getDocumentUrl,
  deleteDocument,
  type PatientDocument,
} from "@/lib/patient/client-data";
import styles from "./page.module.css";

type Load =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; documents: PatientDocument[] };

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function DocumentsView() {
  const [state, setState] = useState<Load>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deleteFor, setDeleteFor] = useState<PatientDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchDocuments()
      .then((res) => {
        if (!active) return;
        setState(res.status === "ready" ? { status: "ready", documents: res.documents } : { status: res.status });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function refresh() {
    setReloadKey((k) => k + 1);
  }
  function notify(tone: "success" | "error", message: string) {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 4000);
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    const res = await uploadDocument(file);
    setUploading(false);
    if (res.ok) {
      notify("success", "Document uploaded.");
      refresh();
    } else if (res.unavailable) {
      setState({ status: "unavailable" });
    } else {
      setUploadError(res.error ?? "We couldn't upload this file. Please try again.");
    }
  }

  async function onOpen(doc: PatientDocument) {
    const url = await getDocumentUrl(doc.storagePath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else notify("error", "We couldn't open this document. Please try again.");
  }

  async function confirmDelete() {
    if (!deleteFor) return;
    setDeleting(true);
    const res = await deleteDocument(deleteFor);
    setDeleting(false);
    setDeleteFor(null);
    if (res.ok) {
      notify("success", "Document deleted.");
      refresh();
    } else {
      notify("error", "We couldn't delete this document. Please try again.");
    }
  }

  const ready = state.status === "ready";

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Documents</h1>

      {toast ? <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} /> : null}

      <p className={styles.note}>
        Private to your account. Upload documents to share with your doctor ahead of a visit
        (PDF, PNG, JPG, or WebP; up to 10 MB).
      </p>

      {(ready || state.status === "loading") && (
        <div className={styles.uploadRow}>
          <input
            ref={fileInput}
            id="document-upload"
            type="file"
            aria-label="Choose a document to upload (PDF, PNG, JPG, or WebP, up to 10 MB)"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={onPick}
            disabled={uploading}
          />
          <Button
            variant="primary"
            onClick={() => fileInput.current?.click()}
            disabled={uploading || !ready}
          >
            {uploading ? "Uploading…" : "Upload Document"}
          </Button>
        </div>
      )}
      {uploadError ? (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {uploadError}
        </div>
      ) : null}

      {state.status === "loading" && <LoadingState label="Loading your documents…" />}
      {state.status === "error" && <ErrorState onRetry={refresh} />}
      {state.status === "unavailable" && (
        <div className={styles.banner} role="status">
          Documents aren&rsquo;t enabled yet. This will be available once the clinic turns it on.
        </div>
      )}

      {ready && state.documents.length === 0 && (
        <EmptyState
          title="No documents yet"
          body="Upload a document above to share it with your doctor ahead of your visit."
        />
      )}

      {ready && state.documents.length > 0 && (
        <ul className={styles.list}>
          {state.documents.map((doc) => {
            const clinic = doc.sourceType === "clinic_provided";
            return (
              <li key={doc.id} className={styles.item}>
                <span className={styles.icon} aria-hidden="true">
                  📄
                </span>
                <div className={styles.body}>
                  <p className={styles.itemName}>
                    {doc.originalFilename}
                    {clinic ? <span className={styles.badge}>Clinic provided</span> : null}
                  </p>
                  <p className={styles.itemMeta}>
                    {[formatSize(doc.sizeBytes), formatDate(doc.createdAt)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className={styles.docActions}>
                  <Button variant="secondary" onClick={() => onOpen(doc)}>
                    Open
                  </Button>
                  {clinic ? null : (
                    <Button variant="destructive" onClick={() => setDeleteFor(doc)}>
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={!!deleteFor}
        onClose={() => (deleting ? undefined : setDeleteFor(null))}
        title="Delete this document?"
        description={deleteFor ? deleteFor.originalFilename : undefined}
      >
        {deleteFor ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Document"}
            </Button>
            <Button variant="secondary" onClick={() => setDeleteFor(null)} disabled={deleting}>
              Keep Document
            </Button>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
