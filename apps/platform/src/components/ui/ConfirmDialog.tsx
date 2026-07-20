import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} isOpen={isOpen} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          {variant === 'danger' ? (
            <div className="rounded-lg bg-red-500/10 p-2 text-red-400">
              <AlertTriangle size={22} />
            </div>
          ) : (
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <AlertTriangle size={22} />
            </div>
          )}
          <p className="text-sm text-[var(--text-2)] leading-relaxed pt-1">{message}</p>
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            <X size={16} />
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
