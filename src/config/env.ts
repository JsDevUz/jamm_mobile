const normalizeUrl = (value?: string) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const deriveAppBaseUrlFromApi = (value?: string) => {
  const normalizedValue = normalizeUrl(value);
  if (!normalizedValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    if (!/^api\./i.test(parsedUrl.hostname)) {
      return normalizedValue;
    }

    parsedUrl.hostname = parsedUrl.hostname.replace(/^api\./i, "");
    parsedUrl.pathname = "";
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return normalizeUrl(parsedUrl.toString());
  } catch {
    return normalizedValue;
  }
};

export const API_BASE_URL =
  normalizeUrl(process.env.EXPO_PUBLIC_API_URL) || "http://localhost:3000";

export const APP_BASE_URL =
  normalizeUrl(process.env.EXPO_PUBLIC_APP_URL) ||
  normalizeUrl(process.env.EXPO_PUBLIC_FRONTEND_URL) ||
  deriveAppBaseUrlFromApi(API_BASE_URL);

export const API_HINT = process.env.EXPO_PUBLIC_API_URL
  ? API_BASE_URL
  : `${API_BASE_URL} (simulator default)`;

export const TURN_URLS = String(process.env.EXPO_PUBLIC_TURN_URLS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export const TURN_USERNAME = String(process.env.EXPO_PUBLIC_TURN_USERNAME || "").trim();

export const TURN_CREDENTIAL = String(process.env.EXPO_PUBLIC_TURN_CREDENTIAL || "").trim();

export const LIVEKIT_URL = normalizeUrl(process.env.EXPO_PUBLIC_LIVEKIT_URL);

export const buildJoinUrl = (roomId: string) =>
  `${APP_BASE_URL}/join/${String(roomId || "").replace(/^\/+/, "")}`;

export const buildSocketNamespaceUrl = (namespace = "") => {
  const normalizedNamespace = namespace
    ? `/${String(namespace).replace(/^\/+/, "")}`
    : "";

  return `${API_BASE_URL}${normalizedNamespace}`;
};
