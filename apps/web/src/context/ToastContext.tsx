import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Bell, X } from 'lucide-react';

export type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title?: string;
  description: React.ReactNode;
  type?: ToastType;
  duration?: number;
}

export interface ToastOptions {
  title?: string;
  description: React.ReactNode;
  type?: ToastType;
  duration?: number;
}

interface ToastFn {
  (options: ToastOptions): void;
  success: (description: React.ReactNode, title?: string) => void;
  error: (description: React.ReactNode, title?: string) => void;
  warning: (description: React.ReactNode, title?: string) => void;
  info: (description: React.ReactNode, title?: string) => void;
}

interface ToastContextValue {
  toast: ToastFn;
  dismiss: (id: string) => void;
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ title, description, type = 'default', duration = 4000 }: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, title, description, type, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  const toast = useMemo(() => {
    const fn = (options: ToastOptions) => addToast(options);
    fn.success = (description: React.ReactNode, title = 'İşlem Başarılı') =>
      addToast({ title, description, type: 'success' });
    fn.error = (description: React.ReactNode, title = 'Hata Oluştu') =>
      addToast({ title, description, type: 'error' });
    fn.warning = (description: React.ReactNode, title = 'Dikkat') =>
      addToast({ title, description, type: 'warning' });
    fn.info = (description: React.ReactNode, title = 'Bilgilendirme') =>
      addToast({ title, description, type: 'info' });
    return fn as ToastFn;
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toast, dismiss, toasts }}>
      {children}
      { }
      <div
        aria-live="polite"
        aria-label="Bildirimler"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => {
          const isError = t.type === 'error';
          return (
            <div
              key={t.id}
              role="alert"
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl bg-card text-card-foreground backdrop-blur-md transition-all duration-200 animate-in slide-in-from-bottom-3 ${
                isError ? 'border-destructive/40 shadow-destructive/5' : 'border-border shadow-black/5'
              }`}
            >
              { }
              <div className="shrink-0 mt-0.5">
                {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-foreground" />}
                {t.type === 'error' && <AlertCircle className="w-4 h-4 text-destructive" />}
                {t.type === 'warning' && <AlertTriangle className="w-4 h-4 text-foreground" />}
                {t.type === 'info' && <Info className="w-4 h-4 text-foreground" />}
                {t.type === 'default' && <Bell className="w-4 h-4 text-foreground" />}
              </div>

              { }
              <div className="flex-1 min-w-0 pr-1">
                {t.title && (
                  <h4 className={`text-xs font-semibold leading-tight mb-1 truncate ${isError ? 'text-destructive' : 'text-foreground'}`}>
                    {t.title}
                  </h4>
                )}
                <div className="text-xs text-muted-foreground leading-relaxed break-words">
                  {t.description}
                </div>
              </div>

              { }
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer -mr-1 -mt-1"
                aria-label="Kapat"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
