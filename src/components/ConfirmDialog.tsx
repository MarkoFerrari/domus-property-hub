import { useState } from "react";
import { Modal } from "./patterns";
import { Btn } from "./ui-primitives";

/** Generic confirm / destructive-action modal. Source of truth §7.2. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width={440}
      footer={
        <>
          <Btn
            onClick={run}
            loading={busy}
            className={destructive ? "!bg-[#b91c1c] hover:!bg-[#991b1b]" : ""}
          >
            {confirmLabel}
          </Btn>
          <Btn variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Btn>
        </>
      }
    />
  );
}
