import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const LANGUAGE_KEY = "jamm.preferences.language";
const THEME_KEY = "jamm.preferences.theme";

export type AppLanguage = "uz" | "en" | "ru";
export type AppTheme = "dark" | "light";

type PreferencesState = {
  initialized: boolean;
  language: AppLanguage;
  theme: AppTheme;
  hydrate: () => Promise<void>;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setTheme: (theme: AppTheme) => Promise<void>;
};

const normalizeLanguage = (value?: string | null): AppLanguage => {
  if (!value) return "uz";
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "en") return "en";
  if (normalized === "ru") return "ru";
  return "uz";
};

const normalizeTheme = (value?: string | null): AppTheme => {
  return value === "light" ? "light" : "dark";
};

const usePreferencesStore = create<PreferencesState>((set, get) => ({
  initialized: false,
  language: "uz",
  theme: "dark",
  hydrate: async () => {
    if (get().initialized) {
      return;
    }

    const [language, theme] = await Promise.all([
      AsyncStorage.getItem(LANGUAGE_KEY),
      AsyncStorage.getItem(THEME_KEY),
    ]);

    set({
      initialized: true,
      language: normalizeLanguage(language),
      theme: normalizeTheme(theme),
    });
  },
  setLanguage: async (language) => {
    const normalized = normalizeLanguage(language);
    await AsyncStorage.setItem(LANGUAGE_KEY, normalized);
    set({ language: normalized });
  },
  setTheme: async (theme) => {
    const normalized = normalizeTheme(theme);
    await AsyncStorage.setItem(THEME_KEY, normalized);
    set({ theme: normalized });
  },
}));

export default usePreferencesStore;
