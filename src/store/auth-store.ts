import { create } from "zustand";
import { ApiError, authApi } from "../lib/api";
import {
  bootstrapPushNotifications,
  unregisterPushNotifications,
} from "../lib/notifications";
import {
  clearSessionStorage,
  getAppUnlockToken,
  getAuthToken,
  getStoredAuthUser,
  setAppUnlockToken,
  setAuthToken,
  setStoredAuthUser,
} from "../lib/session";
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
const OFFLINE_SESSION_USER: User = {};

const normalizeAuthUser = (user: User | null | undefined): User | null => {
  if (!user) {
    return null;
  }

  const appLockEnabled = user.appLockEnabled === true;

  return {
    ...user,
    appLockEnabled,
    appLockSessionUnlocked: appLockEnabled ? user.appLockSessionUnlocked !== false : true,
  };
};

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  bootstrapping: false,
  setUser: (user) => {
    const normalizedUser = normalizeAuthUser(user);
    void setStoredAuthUser(normalizedUser);
    set({
      user: normalizedUser,
      initialized: true,
      bootstrapping: false,
    });
  },
  bootstrapAuth: async () => {
    if (bootstrapPromise) {
      return bootstrapPromise;
    }

    const authToken = await getAuthToken();
    if (!authToken) {
      await setAppUnlockToken(null);
      await setStoredAuthUser(null);
      set({
        user: null,
        initialized: true,
        bootstrapping: false,
      });
      return null;
    }

    const cachedUser = normalizeAuthUser(await getStoredAuthUser());
    const appUnlockToken = await getAppUnlockToken();
    const fallbackUser =
      cachedUser && cachedUser.appLockEnabled && !appUnlockToken
        ? {
            ...cachedUser,
            appLockSessionUnlocked: false,
          }
        : cachedUser ?? OFFLINE_SESSION_USER;

    if (cachedUser && fallbackUser !== cachedUser) {
      await setStoredAuthUser(fallbackUser);
    }

    set({
      user: fallbackUser,
      initialized: true,
      bootstrapping: false,
    });

    bootstrapPromise = authApi
      .restoreSession()
      .then(async (response) => {
        const normalizedUser = normalizeAuthUser(response.user);
        await setStoredAuthUser(normalizedUser);
        set({
          user: normalizedUser,
          initialized: true,
          bootstrapping: false,
        });
        await bootstrapPushNotifications().catch((error) => {
          console.warn("Failed to register push notifications after restore", error);
        });
        return normalizedUser;
      })
      .catch(async (error) => {
        if (error instanceof ApiError && error.status === 401) {
          await setAppUnlockToken(null);
          await setAuthToken(null);
          await setStoredAuthUser(null);
          set({
            user: null,
            initialized: true,
            bootstrapping: false,
          });
          return null;
        }

        if (!(error instanceof ApiError)) {
          console.warn("Failed to bootstrap auth", error);
        }

        set({
          user: fallbackUser,
          initialized: true,
          bootstrapping: false,
        });
        return fallbackUser;
      })
      .finally(() => {
        bootstrapPromise = null;
      });

    return bootstrapPromise;
  },
  login: async (payload) => {
    await setAppUnlockToken(null);
    const response = await authApi.login(payload);
    const normalizedUser = normalizeAuthUser(response.user);
    if (response.access_token) {
      await setAuthToken(response.access_token);
    }
    await setStoredAuthUser(normalizedUser);
    set({
      user: normalizedUser,
      initialized: true,
      bootstrapping: false,
    });
    await bootstrapPushNotifications().catch((error) => {
      console.warn("Failed to register push notifications after login", error);
    });
    return normalizedUser as User;
  },
  signup: async (payload) => {
    const response = await authApi.signup(payload);
    return response.message || "Ro'yxatdan o'tish muvaffaqiyatli bo'ldi.";
  },
  logout: async () => {
    await setAppUnlockToken(null);
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
