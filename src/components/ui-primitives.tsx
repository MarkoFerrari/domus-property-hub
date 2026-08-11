/**
 * Auth-flow primitives — source of truth §4.1 / §7.1.
 * Buttons 48px, inputs 48px, radius 8px, 1.5px borders. Hand-rolled Tailwind
 * so the auth screens match Figma exactly.
 */

import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/* --------------------------------- Button -------------------------------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  loading?: boolean;
};

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = "primary", loading, className = "", children, disabled, ...rest },
  ref,
) {
  const base =
    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "primary"
      ? "bg-[#0D0D0D] text-white hover:bg-[#333333]"
      : "border-[1.5px] border-[#0D0D0D] bg-white text-[#0D0D0D] hover:bg-[#F9F9F9]";
  return (
    <button ref={ref} disabled={disabled || loading} className={`${base} ${styles} ${className}`} {...rest}>
      {loading ? "..." : children}
    </button>
  );
});

/* --------------------------------- Input --------------------------------- */

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  rightSlot?: ReactNode;
};

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { invalid, rightSlot, className = "", ...rest },
  ref,
) {
  const borderClass = invalid
    ? "border-[#DC2626] focus:border-[#DC2626]"
    : "border-[#E8E8E8] focus:border-[#0D0D0D] focus:border-2";
  return (
    <div className="relative">
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={`h-12 w-full rounded-lg border-[1.5px] bg-white px-4 ${
          rightSlot ? "pr-11" : ""
        } text-[15px] text-[#0D0D0D] placeholder:text-[#9CA3AF] outline-none transition-colors ${borderClass} ${className}`}
        {...rest}
      />
      {rightSlot ? (
        <div className="absolute inset-y-0 right-3 flex items-center text-[#6B7280]">{rightSlot}</div>
      ) : null}
    </div>
  );
});

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function SelectInput({ invalid, className = "", children, ...rest }, ref) {
    const borderClass = invalid ? "border-[#DC2626]" : "border-[#E8E8E8] focus:border-[#0D0D0D]";
    return (
      <select
        ref={ref}
        className={`h-12 w-full rounded-lg border-[1.5px] bg-white px-4 text-[15px] text-[#0D0D0D] outline-none transition-colors ${borderClass} ${className}`}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className = "", ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={`w-full rounded-lg border-[1.5px] border-[#E8E8E8] bg-white px-4 py-3 text-[15px] text-[#0D0D0D] placeholder:text-[#9CA3AF] outline-none transition-colors focus:border-[#0D0D0D] ${className}`}
        {...rest}
      />
    );
  },
);

/* --------------------------------- Labels -------------------------------- */

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-semibold text-[#0D0D0D]">
      {children}
    </label>
  );
}

export function HelperText({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <p className={`mt-1.5 text-[12px] ${error ? "text-[#DC2626]" : "text-[#6B7280]"}`}>{children}</p>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[14px] text-[#DC2626]"
    >
      {children}
    </div>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#E8E8E8] bg-[#F9F9F9] px-4 py-3 text-[13px] text-[#6B7280]">
      {children}
    </div>
  );
}

/** Label + input + helper, wired together for screen readers. */
export function LabelledInput({
  label,
  helper,
  error,
  invalid,
  rightSlot,
  ...rest
}: InputProps & { label: string; helper?: ReactNode; error?: ReactNode }) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <TextInput id={id} invalid={invalid || Boolean(error)} rightSlot={rightSlot} {...rest} />
      {error ? <HelperText error>{error}</HelperText> : helper ? <HelperText>{helper}</HelperText> : null}
    </div>
  );
}

/* --------------------------------- Google -------------------------------- */

export function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.9 32.4 29.4 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.3-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16.1 19 13 24 13c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 16.3 4.5 9.7 8.8 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5 0 9.5-1.7 13-4.6l-6-5.1c-1.9 1.4-4.3 2.2-7 2.2-5.4 0-9.9-3.5-11.5-8.4l-6.6 5.1C9.4 39.1 16.1 43.5 24 43.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6 5.1c-.4.4 6.5-4.7 6.5-14.3 0-1.2-.1-2.3-.3-3.5z"
      />
    </svg>
  );
}
