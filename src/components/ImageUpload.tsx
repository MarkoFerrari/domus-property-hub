import { useId, useRef, useState } from "react";
import { ImagePlus, Trash2, Building2 } from "lucide-react";

import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Property photo picker.
 *
 * There is no object storage in this MVP, so the image is downscaled in the
 * browser and stored as a data URL in `Property.photo`. That keeps a single
 * field (`photo_url` / localStorage) working for both backends — wiring this to
 * Supabase Storage later only changes what string goes in, not who reads it.
 *
 * Downscaling matters: a 6 MB phone photo becomes ~120 KB, which is what makes
 * localStorage (5 MB total) and a text column both viable.
 */

const MAX_EDGE = 1400; // px on the long side
const QUALITY = 0.82;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

async function downscale(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("That file is not an image we can read."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  if (scale === 1 && dataUrl.length < 400_000) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

export function ImageUpload({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The original file is long gone by this point: it was downscaled to a data
     URL on import, so "remove" cannot be walked back without the source photo. */
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inputId = useId();

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file — JPG, PNG or WebP.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("That image is over 12 MB. Try a smaller one.");
      return;
    }
    setBusy(true);
    try {
      onChange(await downscale(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not use that image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const open = () => inputRef.current?.click();

  if (value) {
    return (
      <div className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-xl border-[1.5px] border-[#E8E8E8]">
          <img
            src={value}
            alt="Property photo preview"
            className="block h-[180px] w-full object-cover"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={open}
            disabled={busy}
            className="tap-44 inline-flex h-10 items-center gap-2 rounded-lg border-[1.5px] border-[#E8E8E8] px-4 text-[13px] font-semibold text-[#0D0D0D] transition-colors hover:bg-[#F9F9F9] disabled:opacity-40"
          >
            <ImagePlus size={15} aria-hidden="true" />
            {busy ? "Working…" : "Replace photo"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            disabled={busy}
            className="tap-44 inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#FEF2F2] disabled:opacity-40"
          >
            <Trash2 size={15} aria-hidden="true" />
            Remove
          </button>
        </div>

        <ConfirmDialog
          open={confirmRemove}
          title="Remove this photo?"
          description="You will need the original image file to put it back. The copy Domus keeps is deleted when you save the property."
          confirmLabel="Remove photo"
          destructive
          onConfirm={() => {
            setError(null);
            onChange("");
            setConfirmRemove(false);
          }}
          onClose={() => setConfirmRemove(false)}
        />
        {error ? <p className="text-[12px] text-[#DC2626]">{error}</p> : null}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={`flex h-[140px] w-full flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed transition-colors ${
          dragging
            ? "border-[#0D0D0D] bg-[#F9F9F9]"
            : "border-[#E8E8E8] bg-white hover:bg-[#F9F9F9]"
        } disabled:opacity-40`}
      >
        {busy ? (
          <span className="text-[13px] font-semibold text-[#6B7280]">Preparing your image…</span>
        ) : (
          <>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6]">
              <Building2 size={18} color="#6B7280" aria-hidden="true" />
            </span>
            <span className="text-[14px] font-semibold text-[#0D0D0D]">Upload a photo</span>
            <span className="text-[12px] text-[#6B7280]">Drag one here, or click to browse</span>
          </>
        )}
      </button>
      {error ? <p className="text-[12px] text-[#DC2626]">{error}</p> : null}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
    </div>
  );
}
