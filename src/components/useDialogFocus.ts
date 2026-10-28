import { useEffect, useRef } from "react";

/** Keep keyboard navigation inside the top dialog and restore focus on close. */
export function useDialogFocus(open: boolean | string, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const topDialog = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).at(
        -1,
      );
    const controls = () =>
      Array.from(
        topDialog()?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      );
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab") return;
      const nodes = controls();
      if (!nodes.length) return;
      if (!topDialog()?.contains(document.activeElement)) {
        event.preventDefault();
        nodes[0].focus();
        return;
      }
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0].focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [open]);
}
