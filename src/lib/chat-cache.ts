import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ChatSummary, Message, PaginatedMessages } from "../types/entities";

const CHAT_CACHE_VERSION = 1;
const CHAT_LIST_KEY_PREFIX = "jamm.chat-cache.list";
const CHAT_MESSAGES_KEY_PREFIX = "jamm.chat-cache.messages";
const CHAT_SCROLL_KEY_PREFIX = "jamm.chat-cache.scroll";

type CachedMessagesInfiniteData = {
  pages: PaginatedMessages[];
  pageParams: unknown[];
};

type CacheEnvelope<T> = {
  version: number;
  updatedAt: string;
  data: T;
};

const getScopedCacheKey = (prefix: string, userId: string, chatId?: string) => {
  const normalizedUserId = encodeURIComponent(String(userId || "guest"));
  if (!chatId) {
    return `${prefix}.${normalizedUserId}`;
  }

  return `${prefix}.${normalizedUserId}.${encodeURIComponent(String(chatId))}`;
};

const parseEnvelope = async <T>(storageKey: string): Promise<CacheEnvelope<T> | null> => {
  const rawValue = await AsyncStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (parsed?.version !== CHAT_CACHE_VERSION) {
      await AsyncStorage.removeItem(storageKey);
      return null;
    }

    return parsed;
  } catch {
    await AsyncStorage.removeItem(storageKey);
    return null;
  }
};

const writeEnvelope = async <T>(storageKey: string, data: T) => {
  const payload: CacheEnvelope<T> = {
    version: CHAT_CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    data,
  };

  await AsyncStorage.setItem(storageKey, JSON.stringify(payload));
};

const sanitizeMessagesPage = (page: PaginatedMessages): PaginatedMessages => ({
  data: Array.isArray(page.data) ? (page.data.filter(Boolean) as Message[]) : [],
  nextCursor: page.nextCursor ?? null,
  hasMore: Boolean(page.hasMore),
});

export async function loadCachedChats(userId: string) {
  const storageKey = getScopedCacheKey(CHAT_LIST_KEY_PREFIX, userId);
  const envelope = await parseEnvelope<ChatSummary[]>(storageKey);
  return Array.isArray(envelope?.data) ? envelope.data : null;
}

export async function saveCachedChats(userId: string, chats: ChatSummary[]) {
  const storageKey = getScopedCacheKey(CHAT_LIST_KEY_PREFIX, userId);
  await writeEnvelope(storageKey, Array.isArray(chats) ? chats : []);
}

export async function loadCachedMessages(userId: string, chatId: string) {
  const storageKey = getScopedCacheKey(CHAT_MESSAGES_KEY_PREFIX, userId, chatId);
  const envelope = await parseEnvelope<CachedMessagesInfiniteData>(storageKey);
  const pages = envelope?.data?.pages;
  const pageParams = envelope?.data?.pageParams;

  if (!Array.isArray(pages) || !Array.isArray(pageParams)) {
    return null;
  }

  return {
    pages: pages.map(sanitizeMessagesPage),
    pageParams: pageParams.map((pageParam) => (pageParam == null ? null : String(pageParam))),
  } satisfies CachedMessagesInfiniteData;
}

export async function saveCachedMessages(
  userId: string,
  chatId: string,
  data: CachedMessagesInfiniteData,
) {
  const storageKey = getScopedCacheKey(CHAT_MESSAGES_KEY_PREFIX, userId, chatId);
  const pages = Array.isArray(data?.pages) ? data.pages.map(sanitizeMessagesPage) : [];
  const pageParams = Array.isArray(data?.pageParams)
    ? data.pageParams.map((pageParam) => (pageParam == null ? null : String(pageParam)))
    : [];

  await writeEnvelope(storageKey, {
    pages,
    pageParams,
  } satisfies CachedMessagesInfiniteData);
}

export async function loadChatScrollPosition(userId: string, chatId: string) {
  const storageKey = getScopedCacheKey(CHAT_SCROLL_KEY_PREFIX, userId, chatId);
  const envelope = await parseEnvelope<number>(storageKey);
  const offset = Number(envelope?.data);

  if (!Number.isFinite(offset) || offset < 0) {
    return null;
  }

  return offset;
}

export async function saveChatScrollPosition(userId: string, chatId: string, offset: number) {
  const storageKey = getScopedCacheKey(CHAT_SCROLL_KEY_PREFIX, userId, chatId);
  await writeEnvelope(storageKey, Math.max(0, Number(offset) || 0));
}
