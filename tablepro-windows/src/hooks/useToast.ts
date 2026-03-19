import { toast as sonnerToast } from "sonner";
import type { ExternalToast } from "sonner";

type ToastOptions = ExternalToast & {
  description?: string;
};

export function useToast() {
  return {
    success: (title: string, opts?: ToastOptions) =>
      sonnerToast.success(title, opts),

    error: (title: string, opts?: ToastOptions) =>
      sonnerToast.error(title, { duration: Infinity, ...opts }),

    warning: (title: string, opts?: ToastOptions) =>
      sonnerToast.warning(title, opts),

    info: (title: string, opts?: ToastOptions) =>
      sonnerToast.info(title, opts),

    loading: (title: string, opts?: ToastOptions) =>
      sonnerToast.loading(title, opts),

    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
  };
}
