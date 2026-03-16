import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_TOKEN_KEY = "jamm.auth.token";
const PUSH_TOKEN_KEY = "jamm.push.token";

let authTokenCache: string | null = null;
let pushTokenCache: string | null = null;

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
  await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, PUSH_TOKEN_KEY]);
}
