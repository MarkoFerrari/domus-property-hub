/**
 * Certificate document storage.
 *
 * WHY THIS EXISTS: certificates used to record a file NAME and nothing else,
 * from a free-text box. A landlord could type "fire-cert.pdf" and Domus would
 * mark them compliant and clear the alert. The missing document was the smaller
 * problem. The bigger one was that the green state was unearned: the app
 * replaced a real worry with a false calm, based on a string.
 *
 * Now a certificate is only "uploaded" when actual bytes are stored.
 *
 * Two backends, matching db.ts:
 *   - Supabase Storage, private bucket, one folder per user, when configured
 *   - Demo mode cannot store bytes (localStorage is ~5MB and shared with the
 *     whole portfolio), so it records the name and is HONEST about it: the
 *     record is flagged `demo: true` and the UI says the document is not kept.
 */

import { isDemo } from "./demoMode";
import { supabase } from "./supabase";
import type { CertRecord } from "./compliance";

export const CERT_BUCKET = "certificates";

/** Anything bigger is almost certainly a photo of a photo. */
export const MAX_CERT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_CERT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
] as const;

export function isAcceptedCertFile(file: File): boolean {
  if (ACCEPTED_CERT_TYPES.includes(file.type as (typeof ACCEPTED_CERT_TYPES)[number])) return true;
  // Some browsers report an empty type for .heic. Fall back to the extension.
  return /\.(pdf|jpe?g|png|heic)$/i.test(file.name);
}

/** Strip anything that would break a storage path or escape the user folder. */
function safeName(name: string): string {
  return name
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(-120);
}

/**
 * `<userId>/<propertyId>/<certificate name>-<timestamp>.<ext>`
 *
 * The userId prefix is what the storage RLS policy matches on, so it is not
 * cosmetic. See migration 0004.
 */
function objectPath(userId: string, propertyId: string, certName: string, fileName: string) {
  return `${userId}/${propertyId}/${safeName(certName)}-${Date.now()}-${safeName(fileName)}`;
}

export type UploadResult = Pick<CertRecord, "file" | "path" | "demo">;

/**
 * Upload a certificate document and return what to store on the record.
 * Throws with a landlord-readable message. Never returns a path it did not
 * actually write.
 */
export async function uploadCertificate(
  userId: string,
  propertyId: string,
  certName: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_CERT_BYTES) {
    throw new Error("That file is over 10MB. Try a smaller scan or a PDF export.");
  }
  if (!isAcceptedCertFile(file)) {
    throw new Error("Attach a PDF or a photo (JPG, PNG or HEIC).");
  }

  if (isDemo()) {
    // Demo mode: no bytes are kept, and the record says so rather than pretending.
    return { file: file.name, path: undefined, demo: true };
  }

  const path = objectPath(userId, propertyId, certName, file.name);
  const { error } = await supabase!.storage.from(CERT_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    throw new Error(
      error.message.toLowerCase().includes("bucket")
        ? "Document storage is not set up yet. See SETUP_SUPABASE.md, step 4."
        : `Could not upload that document: ${error.message}`,
    );
  }
  return { file: file.name, path, demo: false };
}

/**
 * A short-lived signed URL. The bucket is private, so there is no public URL
 * and a link cannot leak by being forwarded a week later.
 */
export async function certificateUrl(path: string, expiresInSeconds = 60): Promise<string | null> {
  if (isDemo()) return null;
  const { data, error } = await supabase!.storage
    .from(CERT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Best effort. A failed delete must never block the record update: an orphaned
 * object costs storage, a blocked update costs the landlord their correction.
 */
export async function deleteCertificateFile(path: string | undefined): Promise<void> {
  if (!path || isDemo()) return;
  try {
    await supabase!.storage.from(CERT_BUCKET).remove([path]);
  } catch {
    /* orphan is acceptable, blocking the user is not */
  }
}
