import { create } from "zustand";

type ToastItem = {
  id: number;
  message: string;
  duration: number;
};

type ToastStore = {
  toast: ToastItem | null;
  showToast: (message: string, duration?: number) => void;
  clearToast: (id?: number) => void;
};

export const useToastStore = create<ToastStore>((set) => ({
  toast: null,
  showToast: (message, duration = 1800) =>
    set(() => ({
      toast: {
        id: Date.now(),
        message,
        duration,
      },
    })),
  clearToast: (id) =>
    set((state) => {
      if (!state.toast) {
        return state;
      }

      if (typeof id === "number" && state.toast.id !== id) {
        return state;
      }

      return { toast: null };
    }),
}));
