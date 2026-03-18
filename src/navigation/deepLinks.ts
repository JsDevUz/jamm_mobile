export type JammDeepLinkTarget =
  | { kind: "home" }
  | { kind: "feed" }
  | { kind: "chats" }
  | { kind: "articlesHome" }
  | { kind: "coursesHome" }
  | { kind: "profile" }
  | { kind: "coursesArena" }
  | { kind: "article"; articleId: string }
  | { kind: "course"; courseId: string; lessonId?: string }
  | { kind: "groupChat"; identifier: string }
  | { kind: "userChat"; identifier: string }
  | { kind: "chat"; identifier: string }
  | { kind: "groupMeet"; roomId: string }
  | { kind: "arenaTestsList" }
  | { kind: "arenaTest"; testId?: string; shareShortCode?: string }
  | { kind: "arenaFlashcards"; deckId?: string }
  | { kind: "arenaSentenceBuilder"; deckId?: string; shareShortCode?: string }
  | { kind: "arenaMnemonics" };

const MNEMONIC_SEGMENTS = new Set([
  "mnemonika",
  "minemonika",
  "mnemonic",
  "mnemonics",
]);

const decodePathSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

function getUrlSegments(url: URL) {
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  const host = url.hostname.toLowerCase();
  const pathnameSegments = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodePathSegment);

  if (scheme === "jamm") {
    if (host === "jamm.uz" || host === "www.jamm.uz" || !host) {
      return pathnameSegments;
    }

    return [decodePathSegment(host), ...pathnameSegments];
  }

  if (host === "jamm.uz" || host === "www.jamm.uz") {
    return pathnameSegments;
  }

  return null;
}

export function parseJammDeepLink(urlString: string): JammDeepLinkTarget | null {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlString);
  } catch {
    return null;
  }

  const segments = getUrlSegments(parsedUrl);
  if (!segments) {
    return null;
  }

  const [first = "", second = "", third = ""] = segments;
  const firstLower = first.toLowerCase();
  const secondLower = second.toLowerCase();

  if (!first) {
    return { kind: "home" };
  }

  if (firstLower === "home") {
    return { kind: "home" };
  }

  if (firstLower === "feed") {
    return { kind: "feed" };
  }

  if (firstLower === "chats" || firstLower === "users") {
    if (second) {
      return firstLower === "users"
        ? { kind: "userChat", identifier: second }
        : { kind: "chats" };
    }

    return { kind: "chats" };
  }

  if (firstLower === "groups") {
    return second ? { kind: "groupChat", identifier: second } : { kind: "chats" };
  }

  if (firstLower === "profile") {
    return { kind: "profile" };
  }

  if (firstLower === "articles") {
    return second ? { kind: "article", articleId: second } : { kind: "articlesHome" };
  }

  if (firstLower === "courses") {
    return second
      ? { kind: "course", courseId: second, lessonId: third || undefined }
      : { kind: "coursesHome" };
  }

  if (firstLower === "a") {
    return second ? { kind: "chat", identifier: second } : { kind: "chats" };
  }

  if (firstLower === "join") {
    return second ? { kind: "groupMeet", roomId: second } : null;
  }

  if (firstLower === "arena") {
    if (!second) {
      return { kind: "coursesArena" };
    }

    if (secondLower === "quiz-link") {
      return third
        ? { kind: "arenaTest", shareShortCode: third }
        : { kind: "arenaTestsList" };
    }

    if (secondLower === "quiz") {
      return third ? { kind: "arenaTest", testId: third } : { kind: "arenaTestsList" };
    }

    if (secondLower === "flashcard" || secondLower === "flashcards") {
      return third
        ? { kind: "arenaFlashcards", deckId: third }
        : { kind: "arenaFlashcards" };
    }

    if (secondLower === "sentence-builder") {
      return third
        ? { kind: "arenaSentenceBuilder", shareShortCode: third }
        : { kind: "arenaSentenceBuilder" };
    }

    if (secondLower === "sentence-builders") {
      return third
        ? { kind: "arenaSentenceBuilder", deckId: third }
        : { kind: "arenaSentenceBuilder" };
    }

    if (MNEMONIC_SEGMENTS.has(secondLower)) {
      return { kind: "arenaMnemonics" };
    }

    return { kind: "coursesArena" };
  }

  if (first.startsWith(":")) {
    return { kind: "article", articleId: first };
  }

  if (first.startsWith("+")) {
    return { kind: "course", courseId: first, lessonId: second || undefined };
  }

  if (first.startsWith("-")) {
    return { kind: "groupChat", identifier: first };
  }

  return { kind: "chat", identifier: first };
}
