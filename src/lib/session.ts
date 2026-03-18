import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "../types/entities";

const AUTH_TOKEN_KEY = "jamm.auth.token";
const PUSH_TOKEN_KEY = "jamm.push.token";
const AUTH_USER_KEY = "jamm.auth.user";

let authTokenCache: string | null = null;
let pushTokenCache: string | null = null;
let authUserCache: User | null | undefined;
let appUnlockTokenCache: string | null = null;

export async function getAuthToken() {
  if (authTokenCache !== null) {
    return authTokenCache;
  }

  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  authTokenCache = token;
  return token;
}

export async function setAuthToken(token: string | null | undefined) {
  authTokenCache = token ? String(token) : null;

  if (authTokenCache) {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, authTokenCache);
    return authTokenCache;
  }

  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  return null;
}

export async function getStoredAuthUser() {
  if (authUserCache !== undefined) {
    return authUserCache;
  }

  const rawUser = await AsyncStorage.getItem(AUTH_USER_KEY);
  if (!rawUser) {
    authUserCache = null;
    return authUserCache;
  }

  try {
    authUserCache = JSON.parse(rawUser) as User;
  } catch {
    authUserCache = null;
    await AsyncStorage.removeItem(AUTH_USER_KEY);
  }

  return authUserCache;
}

export async function setStoredAuthUser(user: User | null | undefined) {
  authUserCache = user ?? null;

  if (authUserCache) {
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUserCache));
    return authUserCache;
  }

  await AsyncStorage.removeItem(AUTH_USER_KEY);
  return null;
}

export async function getAppUnlockToken() {
  return appUnlockTokenCache;
}

export async function setAppUnlockToken(token: string | null | undefined) {
  appUnlockTokenCache = token ? String(token) : null;
  return appUnlockTokenCache;
}

export async function getPushToken() {
  if (pushTokenCache !== null) {
    return pushTokenCache;
  }

  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  pushTokenCache = token;
  return token;
}

export async function setPushToken(token: string | null | undefined) {
  pushTokenCache = token ? String(token) : null;

  if (pushTokenCache) {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, pushTokenCache);
    return pushTokenCache;
  }

  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  return null;
}

export async function clearSessionStorage() {
  authTokenCache = null;
  pushTokenCache = null;
  authUserCache = null;
  appUnlockTokenCache = null;
  await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, PUSH_TOKEN_KEY, AUTH_USER_KEY]);
}
