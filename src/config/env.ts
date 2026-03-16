const normalizeUrl = (value?: string) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

export const API_BASE_URL =
  normalizeUrl(process.env.EXPO_PUBLIC_API_URL) || "http://localhost:3000";

export const API_HINT = process.env.EXPO_PUBLIC_API_URL
  ? API_BASE_URL
  : `${API_BASE_URL} (simulator default)`;

export const buildSocketNamespaceUrl = (namespace = "") => {
  const normalizedNamespace = namespace
    ? `/${String(namespace).replace(/^\/+/, "")}`
    : "";

  return `${API_BASE_URL}${normalizedNamespace}`;
};
