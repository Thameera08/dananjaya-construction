"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import { X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DrawerCtx = createContext<{ close: () => void } | null>(null);
/** Lets forms inside a drawer close it after a successful save. */
export const useDrawer = () => useContext(DrawerCtx);

type Props = {
  /** Contents of the trigger button. */
  trigger: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerClassName?: string;
  triggerLabel?: string; // aria-label / tooltip for icon-only triggers
  title?: React.ReactNode;
  description?: React.ReactNode;
  side?: "right" | "left";
  children: React.ReactNode;
};

/**
 * Slide-over panel built on the native <dialog> element: focus trapping, Esc to close
 * and an inert background come from the browser. Click the backdrop to dismiss.
 */
export function Drawer({ trigger, triggerVariant = "outline", triggerSize = "sm", triggerClassName, triggerLabel, title, description, side = "right", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => ref.current?.close(), []);

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        aria-label={triggerLabel}
        title={triggerLabel}
        onClick={() => {
          ref.current?.showModal();
          // Focus the panel, not the first control, so no stray focus ring appears; Tab still works.
          ref.current?.querySelector<HTMLElement>("[data-drawer-panel]")?.focus();
        }}
      >
        {trigger}
      </Button>
      <dialog
        ref={ref}
        className={cn("drawer", side === "left" && "drawer-left")}
        onClick={(e) => {
          if (e.target === ref.current) close(); // backdrop click
        }}
      >
        <DrawerCtx value={{ close }}>
          {side === "left" ? (
            <div data-drawer-panel tabIndex={-1} className="flex h-full flex-col outline-none">
              {children}
            </div>
          ) : (
            <div data-drawer-panel tabIndex={-1} className="flex h-full flex-col outline-none">
              <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
                <div>
                  {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
                  {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
                </div>
                <button type="button" onClick={close} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Close">
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            </div>
          )}
        </DrawerCtx>
      </dialog>
    </>
  );
}
