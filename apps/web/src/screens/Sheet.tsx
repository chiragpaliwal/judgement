import { useEffect, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Icon } from '../ui/icons';

const OUT = [0.2, 0.8, 0.2, 1] as const;

/** Bottom sheet with a veil. `full` makes it a full-screen page. */
export function Sheet({
  title,
  sub,
  onClose,
  children,
  variant = 'tall',
  label,
  action,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  variant?: 'tall' | 'short' | 'full';
  label: string;
  /** Extra control in the header, left of Close. */
  action?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (variant === 'full') {
    return (
      <motion.div className="full" role="dialog" aria-modal aria-label={label} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.25, ease: OUT }}>
        <header style={{ padding: '18px 12px 6px 20px', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>{title}</h2>
          {sub && (
            <span className="dim" style={{ fontSize: 14 }}>
              {sub}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button className="ib" aria-label="Close" onClick={onClose}>
            <Icon.X />
          </button>
        </header>
        {children}
      </motion.div>
    );
  }

  return (
    <>
      <motion.div className="veil" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
      <motion.section
        className={['bsheet', variant === 'short' && 'short', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal
        aria-label={label}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.3, ease: OUT }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) onClose();
        }}
      >
        <div className="grab" />
        <div className="shd">
          <h2>{title}</h2>
          {sub && (
            <span className="dim" style={{ fontSize: 14 }}>
              {sub}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {action}
          <button className="ib" aria-label="Close" onClick={onClose}>
            <Icon.X />
          </button>
        </div>
        {children}
      </motion.section>
    </>
  );
}
