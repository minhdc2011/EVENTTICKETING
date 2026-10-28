import type {ToastPayload} from '../../domain/runtimeOverlays.js';

export type RuntimeToast = Required<Pick<ToastPayload, 'id' | 'message' | 'type'>> & {
  durationMs?: number;
};

export type RuntimeToastContainerProps = {
  toasts: RuntimeToast[];
  onDismiss?: (id: string) => void;
};

function ToastIcon({type}: {type: RuntimeToast['type']}) {
  if (type === 'error') {
    return (
      <svg
        className="w-4 h-4 text-red-400 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    );
  }
  if (type === 'success') {
    return (
      <svg
        className="w-4 h-4 text-emerald-400 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (type === 'warning') {
    return (
      <svg
        className="w-4 h-4 text-amber-400 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  return (
    <svg
      className="w-4 h-4 text-blue-400 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function getToastVariantClasses(type: RuntimeToast['type']): string {
  switch (type) {
    case 'error':
      return 'border-red-500/50 bg-[#160b0e]/95 text-red-200 shadow-red-950/50';
    case 'success':
      return 'border-emerald-500/50 bg-[#0a1610]/95 text-emerald-200 shadow-emerald-950/50';
    case 'warning':
      return 'border-amber-500/50 bg-[#191409]/95 text-amber-200 shadow-amber-950/50';
    case 'info':
    default:
      return 'border-white/[0.1] bg-[#0D1117]/95 text-slate-200';
  }
}

/**
 * Toast notifications container managed by React.
 * Replaces legacy DOM injection with accessible live regions and variant styling.
 */
export function RuntimeToastContainer({toasts, onDismiss}: RuntimeToastContainerProps) {
  return (
    <div
      id="toast-container"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-6 right-6 z-50 flex flex-col space-y-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`toast-animate pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-[12px] border text-xs shadow-2xl backdrop-blur-md max-w-sm ${getToastVariantClasses(
            toast.type
          )}`}
        >
          <ToastIcon type={toast.type} />
          <span className="flex-1 font-medium leading-tight">{toast.message}</span>
          {onDismiss && (
            <button
              type="button"
              aria-label="Đóng thông báo"
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-white transition p-1 cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
