// Toast display component
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export function ToastContainer() {
  const { toasts } = useToast();

  const icons = {
    success: <CheckCircle size={16} />,
    error: <XCircle size={16} />,
    info: <Info size={16} />,
  };

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {icons[t.type]}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// Spinner
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div className={`spinner spinner-${size === 'md' ? '' : size} ${className}`} />
  );
}

// Loading State
export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="loading-state">
      <Spinner size="lg" />
      <span>{message}</span>
    </div>
  );
}

// Empty State
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

import React from 'react';
import { PackageOpen } from 'lucide-react';

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {icon ?? <PackageOpen size={24} />}
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

// Badge
interface BadgeProps {
  variant: string;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {children}
    </span>
  );
}

// Difficulty Badge
export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return <Badge variant={difficulty}>{difficulty}</Badge>;
}

// Modal
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${size === 'lg' ? 'modal-lg' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// Stat Card
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  meta?: string;
}

export function StatCard({ label, value, icon, meta }: StatCardProps) {
  return (
    <div className="stat-card">
      {icon && <div className="stat-icon">{icon}</div>}
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {meta && <div className="stat-meta">{meta}</div>}
    </div>
  );
}

// Progress Bar
export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// Confirm Modal
interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}

export function ConfirmModal({
  open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', loading
}: ConfirmProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <Spinner size="sm" /> : confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
