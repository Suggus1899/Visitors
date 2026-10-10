'use client';

import { Modal, useOverlayState } from '@heroui/react';
import type { UseOverlayStateReturn } from '@heroui/react';
import { createContext, useContext, type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const DialogState = createContext<UseOverlayStateReturn | null>(null);

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode }) {
  const state = useOverlayState({ isOpen: open, onOpenChange });
  return <Modal state={state}><Modal.Trigger className="hidden" aria-hidden="true" tabIndex={-1}>Abrir diálogo</Modal.Trigger><DialogState.Provider value={state}>{children}</DialogState.Provider></Modal>;
}

type DismissEvent = { preventDefault(): void };
type DialogContentProps = Omit<ComponentProps<typeof Modal.Dialog>, 'children'> & {
  children: ReactNode;
  showCloseButton?: boolean;
  onEscapeKeyDown?: (event: DismissEvent) => void;
  onPointerDownOutside?: (event: DismissEvent) => void;
};

export function DialogContent({ className, children, showCloseButton = true, onEscapeKeyDown, onPointerDownOutside, ...props }: DialogContentProps) {
  const state = useContext(DialogState);
  if (!state) throw new Error('DialogContent debe estar dentro de Dialog');
  const preventDismiss = Boolean(onEscapeKeyDown || onPointerDownOutside);
  return (
    <Modal.Backdrop isDismissable={!preventDismiss} isKeyboardDismissDisabled={preventDismiss} variant="opaque" className="z-50">
      <Modal.Container placement="center" scroll="inside" size="lg" className="fixed inset-0 flex items-center justify-center p-4">
        <Modal.Dialog className={cn('relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[color:var(--border-1)] bg-[color:var(--surface-1)] p-6 text-[color:var(--text-1)] shadow-xl', className)} {...props}>
          {children}
          {showCloseButton && <Modal.CloseTrigger aria-label="Cerrar" className="absolute right-3 top-3 rounded-md p-2 text-[color:var(--text-3)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text-1)]"><X size={16} /></Modal.CloseTrigger>}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

export const DialogTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <Modal.Heading className={cn('text-lg font-semibold leading-tight', className)} {...props} />
);

export const DialogDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <p slot="description" className={cn('text-sm text-[color:var(--text-3)]', className)} {...props} />
);

export const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
export const DialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
