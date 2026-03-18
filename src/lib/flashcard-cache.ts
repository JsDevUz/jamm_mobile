import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ArenaFlashcardDeck } from "../types/arena";

const FLASHCARD_LIST_CACHE_KEY = "jamm:arena:flashcards:list:v1";
const FLASHCARD_DETAIL_CACHE_KEY = "jamm:arena:flashcards:details:v1";

function getDeckIdentifier(deck?: ArenaFlashcardDeck | null) {
  return String(deck?._id || deck?.urlSlug || "").trim();
}

function safeParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function loadDetailsMap() {
  return safeParse<Record<string, ArenaFlashcardDeck>>(
    await AsyncStorage.getItem(FLASHCARD_DETAIL_CACHE_KEY),
  ) || {};
}

async function saveDetailsMap(map: Record<string, ArenaFlashcardDeck>) {
  await AsyncStorage.setItem(FLASHCARD_DETAIL_CACHE_KEY, JSON.stringify(map));
}

export async function loadFlashcardDeckListCache() {
  return (
    safeParse<ArenaFlashcardDeck[]>(await AsyncStorage.getItem(FLASHCARD_LIST_CACHE_KEY)) || []
  );
}

export async function saveFlashcardDeckListCache(decks: ArenaFlashcardDeck[]) {
  await AsyncStorage.setItem(FLASHCARD_LIST_CACHE_KEY, JSON.stringify(decks || []));
}

export async function getFlashcardDeckCache(deckId?: string | null) {
  const identifier = String(deckId || "").trim();
  if (!identifier) {
    return null;
  }

  const map = await loadDetailsMap();
  return map[identifier] || null;
}

export async function upsertFlashcardDeckCache(deck: ArenaFlashcardDeck) {
  const identifier = getDeckIdentifier(deck);
  if (!identifier) {
    return;
  }

  const [list, detailMap] = await Promise.all([
    loadFlashcardDeckListCache(),
    loadDetailsMap(),
  ]);

  const listMap = new Map<string, ArenaFlashcardDeck>();
  list.forEach((item, index) => {
    const key = getDeckIdentifier(item) || `deck-${index}`;
    listMap.set(key, item);
  });
  listMap.set(identifier, deck);

  detailMap[identifier] = deck;

  await Promise.all([
    saveFlashcardDeckListCache(Array.from(listMap.values())),
    saveDetailsMap(detailMap),
  ]);
}

export async function replaceFlashcardDeckListCache(decks: ArenaFlashcardDeck[]) {
  const nextList = Array.isArray(decks) ? decks : [];
  const detailMap = await loadDetailsMap();

  nextList.forEach((deck) => {
    const identifier = getDeckIdentifier(deck);
    if (identifier) {
      detailMap[identifier] = {
        ...(detailMap[identifier] || {}),
        ...deck,
      };
    }
  });

  await Promise.all([
    saveFlashcardDeckListCache(nextList),
    saveDetailsMap(detailMap),
  ]);
}

export async function removeFlashcardDeckCache(deckId?: string | null) {
  const identifier = String(deckId || "").trim();
  if (!identifier) {
    return;
  }

  const [list, detailMap] = await Promise.all([
    loadFlashcardDeckListCache(),
    loadDetailsMap(),
  ]);

  const nextList = list.filter((deck) => getDeckIdentifier(deck) !== identifier);
  delete detailMap[identifier];

  await Promise.all([
    saveFlashcardDeckListCache(nextList),
    saveDetailsMap(detailMap),
  ]);
}
