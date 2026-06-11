import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
  showCloseButton?: boolean;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  isDirty?: boolean;
  themeColor?: string; // e.g. "bg-blue-600", "bg-purple-600"
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
  footer,
  isDirty = false,
  themeColor = "bg-blue-600"
}: ModalProps) {
  const { t } = useTranslation(['common', 'database']);
  const modalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = useCallback(() => {
    if (isDirty) {
      if (!window.confirm('Existem alterações não salvas. Tem certeza que deseja fechar?')) {
        return;
      }
    }
    onClose();
  }, [isDirty, onClose]);

  // Focus trap: trap Tab/Shift+Tab inside the modal
  useEffect(() => {
    if (!isOpen) return;

    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const el = modalRef.current;
      if (!el) return;

      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => !node.hasAttribute('disabled') && node.offsetParent !== null
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    // Focus the first focusable element when modal opens
    const el = modalRef.current;
    if (el) {
      const focusable = el.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = Array.from(focusable).find((n) => !n.hasAttribute('disabled'));
      if (first) first.focus();
    }

    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if the click was inside a portal that belongs to the modal
      // This is necessary because Portals are technically outside the modalRef DOM tree
      const target = event.target as HTMLElement;
      const isPortalClick = target.closest('[data-modal-portal="true"]');

      if (modalRef.current && !modalRef.current.contains(target) && !isPortalClick) {
        handleClose();
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-all duration-300 animate-in fade-in">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`bg-white dark:bg-neutral-900 ${maxWidth} w-full max-h-[90vh] rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-white/20 dark:border-neutral-800 animate-in zoom-in-95 duration-200`}
      >
        {/* Top Accent Bar */}
        <div className={`h-1.5 w-full ${themeColor} opacity-80`} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md">
          <div>
            <h3 id="modal-title" className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {title}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-neutral-500 uppercase font-bold tracking-widest mt-0.5">
              {t('common:dashboard.form.administrative_subtitle', 'Formulário Administrativo')}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2.5 rounded-2xl hover:bg-gray-100 dark:hover:bg-neutral-800 transition-all duration-200 text-gray-400 hover:text-gray-900 dark:hover:text-white group"
            aria-label="Close modal"
          >
            <svg
              className="w-5 h-5 transition-transform group-hover:rotate-90 duration-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar dark:custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 bg-gray-50/80 dark:bg-neutral-800/50 backdrop-blur-sm border-t border-gray-100 dark:border-neutral-800 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
