import { create } from "zustand";
import { ApiError, authApi } from "../lib/api";
import { unregisterPushNotifications } from "../lib/notifications";
import { clearSessionStorage, setAuthToken } from "../lib/session";
import type { User } from "../types/entities";

type LoginPayload = {
  email: string;
  password: string;
};

type SignupPayload = LoginPayload & {
  nickname: string;
};

type AuthState = {
  user: User | null;
  initialized: boolean;
  bootstrapping: boolean;
  setUser: (user: User | null) => void;
  bootstrapAuth: () => Promise<User | null>;
  login: (payload: LoginPayload) => Promise<User>;
  signup: (payload: SignupPayload) => Promise<string>;
  logout: () => Promise<void>;
};

let bootstrapPromise: Promise<User | null> | null = null;

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  bootstrapping: false,
  setUser: (user) =>
    set({
      user,
      initialized: true,
      bootstrapping: false,
    }),
  bootstrapAuth: async () => {
    if (bootstrapPromise) {
      return bootstrapPromise;
    }

    set({ bootstrapping: true });

    bootstrapPromise = authApi
      .restoreSession()
      .then((response) => {
        set({
          user: response.user,
          initialized: true,
          bootstrapping: false,
        });
        return response.user;
      })
      .catch((error) => {
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.warn("Failed to bootstrap auth", error);
        }
        void setAuthToken(null);

        set({
          user: null,
          initialized: true,
          bootstrapping: false,
        });
        return null;
      })
      .finally(() => {
        bootstrapPromise = null;
      });

    return bootstrapPromise;
  },
  login: async (payload) => {
    const response = await authApi.login(payload);
    if (response.access_token) {
      await setAuthToken(response.access_token);
    }
    set({
      user: response.user,
      initialized: true,
      bootstrapping: false,
    });
    return response.user;
  },
  signup: async (payload) => {
    const response = await authApi.signup(payload);
    return response.message || "Ro'yxatdan o'tish muvaffaqiyatli bo'ldi.";
  },
  logout: async () => {
    await unregisterPushNotifications().catch(() => undefined);
    await authApi.logout();
    await clearSessionStorage();
    set({
      user: null,
      initialized: true,
      bootstrapping: false,
    });
  },
}));

export default useAuthStore;
