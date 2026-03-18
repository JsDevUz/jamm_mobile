export const APP_LIMITS = {
  postsPerDay: { ordinary: 10, premium: 20 },
  postWords: 100,
  postDraftChars: 3000,
  postImagesPerPost: { ordinary: 0, premium: 3 },
  postImageBytes: 5 * 1024 * 1024,
  articlesPerUser: { ordinary: 10, premium: 30 },
  articleWords: { ordinary: 1000, premium: 2000 },
  articleTitleChars: 120,
  articleExcerptChars: 220,
  articleTagChars: 24,
  articleTagCount: 8,
  testsCreated: { ordinary: 10, premium: 20 },
  testTitleChars: 120,
  testDescriptionChars: 300,
  testQuestionChars: 240,
  testOptionChars: 140,
  flashcardsCreated: { ordinary: 10, premium: 20 },
  sentenceBuildersCreated: { ordinary: 10, premium: 20 },
  lessonHomeworkPerLesson: { ordinary: 1, premium: 3 },
  homeworkPhotoBytes: 10 * 1024 * 1024,
  homeworkAudioBytes: 20 * 1024 * 1024,
  homeworkVideoBytes: 100 * 1024 * 1024,
  homeworkPdfBytes: 20 * 1024 * 1024,
  sentenceBuilderShareLinksPerDeck: { ordinary: 2, premium: 4 },
  flashcardsPerDeck: 30,
  flashcardDeckPageSize: 20,
  flashcardTitleChars: 120,
  flashcardSideChars: 220,
  sentenceBuilderPageSize: 20,
  sentenceBuilderTitleChars: 120,
  sentenceBuilderDescriptionChars: 300,
  sentenceBuilderPromptChars: 240,
  sentenceBuilderAnswerChars: 240,
  sentenceBuilderTokenChars: 40,
  nicknameChars: 30,
  usernameChars: 24,
  bioChars: 160,
  passcodeLength: 8,
} as const;

export function isPremiumStatus(status?: string | null) {
  return status === "active" || status === "premium";
}

export function getTierLimit(
  limits: { ordinary: number; premium: number },
  status?: string | null,
) {
  return isPremiumStatus(status) ? limits.premium : limits.ordinary;
}

export function countWords(value = "") {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
