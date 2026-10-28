'use client';
import { useEffect, useRef } from 'react';

/** Janela modal acessível: foco inicial, Esc fecha, foco preso dentro. */
export default function Modal({ title, onClose, children, className = '', labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement;
    const first = el?.querySelector('[data-autofocus], button, [href], input, select, textarea');
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const nodes = [...el.querySelectorAll('button:not([disabled]), [href], input, select, textarea')];
        if (!nodes.length) return;
        const a = nodes[0];
        const b = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('keydown', onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title} aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}
