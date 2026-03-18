import { Linking } from "react-native";
import { APP_BASE_URL } from "../config/env";
import { usersApi } from "../lib/api";
import {
  parseJammDeepLink,
  type JammDeepLinkTarget,
} from "./deepLinks";

type JammInternalLinkOpener = (target: JammDeepLinkTarget) => Promise<void> | void;

let currentOpener: JammInternalLinkOpener | null = null;

const ABSOLUTE_URL_REGEX = /^[a-z][a-z0-9+.-]*:/i;

const normalizeInternalCandidateUrl = (value: string) => {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) {
    return "";
  }

  if (ABSOLUTE_URL_REGEX.test(trimmedValue)) {
    return trimmedValue;
  }

  if (/^(?:www\.)?jamm\.uz(?:\/|$)/i.test(trimmedValue)) {
    return `https://${trimmedValue.replace(/^\/+/, "")}`;
  }

  try {
    const normalizedPath = trimmedValue.startsWith("/") ? trimmedValue : `/${trimmedValue}`;
    return new URL(normalizedPath, APP_BASE_URL).toString();
  } catch {
    return trimmedValue;
  }
};

async function dispatchInternalTarget(target: JammDeepLinkTarget) {
  if (currentOpener) {
    await currentOpener(target);
    return true;
  }

  return false;
}

export function setJammInternalLinkOpener(opener: JammInternalLinkOpener | null) {
  currentOpener = opener;
}

export function getJammInternalTarget(url: string) {
  const normalizedUrl = normalizeInternalCandidateUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  return parseJammDeepLink(normalizedUrl);
}

export function isJammInternalLink(url: string) {
  return Boolean(getJammInternalTarget(url));
}

export async function openJammAwareLink(url: string, fallbackExternal = true) {
  const normalizedUrl = normalizeInternalCandidateUrl(url);
  const internalTarget = normalizedUrl ? parseJammDeepLink(normalizedUrl) : null;

  if (internalTarget) {
    const handled = await dispatchInternalTarget(internalTarget);
    if (handled) {
      return true;
    }
  }

  if (fallbackExternal && normalizedUrl) {
    await Linking.openURL(normalizedUrl);
    return false;
  }

  return false;
}

export async function openJammProfileMention(username: string) {
  const normalizedUsername = String(username || "").trim().replace(/^@+/, "");
  if (!normalizedUsername) {
    throw new Error("Username topilmadi.");
  }

  const profile = await usersApi.getPublicProfile(normalizedUsername);
  const identifier =
    String(profile?.jammId || "").trim() || String(profile?._id || profile?.id || "").trim();

  if (!identifier) {
    throw new Error("Profile identifikatori topilmadi.");
  }

  const handled = await dispatchInternalTarget({
    kind: "profile",
    identifier,
  });

  if (handled) {
    return true;
  }

  const fallbackPath = String(profile?.jammId || "").trim()
    ? `${APP_BASE_URL}/profile/${String(profile.jammId).trim()}`
    : `${APP_BASE_URL}/profile/${identifier}`;
  await Linking.openURL(fallbackPath);
  return true;
}
