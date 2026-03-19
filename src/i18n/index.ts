import { useEffect } from "react";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import uz from "./locales/uz.json";
import usePreferencesStore, { type AppLanguage, type AppTheme } from "../store/preferences-store";

type TranslationDictionary = Record<string, any>;

const resources: Record<AppLanguage, TranslationDictionary> = {
  uz,
  en,
  ru,
};

const THEME_PALETTES = {
  dark: {
    primary: "#5865F2",
    background: "#36393F",
    surface: "#2F3136",
    surfaceElevated: "#2F3136",
    surfaceMuted: "#202225",
    border: "#40444B",
    primarySoft: "rgba(88, 101, 242, 0.1)",
    accent: "#43B581",
    text: "#DCDDDE",
    mutedText: "#B9BBBE",
    subtleText: "#72767D",
    danger: "#F04747",
    warning: "#FAA61A",
    input: "#40444B",
    hover: "rgba(255, 255, 255, 0.1)",
    active: "rgba(88, 101, 242, 0.1)",
    badge: "#5865F2",
  },
  light: {
    primary: "#5865F2",
    background: "#F5F7FB",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceMuted: "#EEF1F6",
    border: "#D6DCE6",
    primarySoft: "rgba(88, 101, 242, 0.12)",
    accent: "#2F9E64",
    text: "#1F2937",
    mutedText: "#5B6472",
    subtleText: "#7A8394",
    danger: "#D64545",
    warning: "#C97A00",
    input: "#F3F5F9",
    hover: "rgba(15, 23, 42, 0.06)",
    active: "rgba(88, 101, 242, 0.12)",
    badge: "#5865F2",
  },
} as const;

const getByPath = (source: TranslationDictionary, path: string) =>
  path.split(".").reduce<any>((current, part) => {
    if (!current || Array.isArray(current) || typeof current !== "object") {
      return undefined;
    }
    return current[part];
  }, source);

const interpolate = (value: string, replacements?: Record<string, string | number>) => {
  if (!replacements) return value;

  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key) => {
    const replacement = replacements[key.trim()];
    return replacement === undefined || replacement === null ? "" : String(replacement);
  });
};

export const translate = (
  language: AppLanguage,
  key: string,
  replacements?: Record<string, string | number>,
) => {
  const localizedValue = getByPath(resources[language], key);
  const fallbackValue = getByPath(resources.uz, key);
  const resolved =
    typeof localizedValue === "string"
      ? localizedValue
      : typeof fallbackValue === "string"
        ? fallbackValue
        : key;
  return interpolate(resolved, replacements);
};

export function useI18n() {
  const initialized = usePreferencesStore((state) => state.initialized);
  const language = usePreferencesStore((state) => state.language);
  const theme = usePreferencesStore((state) => state.theme);
  const hydrate = usePreferencesStore((state) => state.hydrate);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const setTheme = usePreferencesStore((state) => state.setTheme);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return {
    initialized,
    language,
    theme,
    colors: THEME_PALETTES[theme as AppTheme],
    t: (key: string, replacements?: Record<string, string | number>) =>
      translate(language, key, replacements),
    setLanguage,
    setTheme,
  };
}
