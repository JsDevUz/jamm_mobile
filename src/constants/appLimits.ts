export const APP_LIMITS = {
  postsPerDay: { ordinary: 10, premium: 20 },
  postCommentsPerPost: { ordinary: 5, premium: 10 },
  postWords: 100,
  postDraftChars: 3000,
  postImagesPerPost: { ordinary: 0, premium: 3 },
  postImageBytes: 5 * 1024 * 1024,
  articlesPerUser: { ordinary: 10, premium: 30 },
  articleCommentsPerArticle: { ordinary: 5, premium: 10 },
  articleImagesPerArticle: { ordinary: 2, premium: 5 },
  articleWords: { ordinary: 1000, premium: 2000 },
  articleTitleChars: 120,
  articleExcerptChars: 220,
  articleTagChars: 24,
  articleTagCount: 8,
  postCommentChars: 400,
  articleCommentChars: 400,
  groupsCreated: { ordinary: 3, premium: 6 },
  groupsJoined: { ordinary: 10, premium: 20 },
  messageChars: 400,
  groupNameChars: 60,
  groupDescriptionChars: 240,
  meetsCreated: { ordinary: 2, premium: 4 },
  meetParticipants: { ordinary: 10, premium: 40 },
  meetTitleChars: 80,
  meetDescriptionChars: 240,
  coursesCreated: { ordinary: 2, premium: 6 },
  lessonsPerCourse: { ordinary: 10, premium: 30 },
  lessonVideosPerLesson: { ordinary: 1, premium: 3 },
  lessonMediaBytes: 200 * 1024 * 1024,
  lessonTestsPerLesson: { ordinary: 1, premium: 1 },
  testsCreated: { ordinary: 30, premium: 100 },
  testShareLinksPerTest: { ordinary: 2, premium: 4 },
  testTitleChars: 120,
  testDescriptionChars: 300,
  testQuestionChars: 240,
  testOptionChars: 140,
  flashcardsCreated: { ordinary: 30, premium: 100 },
  sentenceBuildersCreated: { ordinary: 30, premium: 100 },
  lessonHomeworkPerLesson: { ordinary: 1, premium: 3 },
  homeworkTextChars: 2000,
  homeworkLinkChars: 300,
  homeworkPhotoBytes: 10 * 1024 * 1024,
  homeworkAudioBytes: 20 * 1024 * 1024,
  homeworkVideoBytes: 100 * 1024 * 1024,
  homeworkPdfBytes: 20 * 1024 * 1024,
  courseNameChars: 120,
  courseDescriptionChars: 500,
  lessonTitleChars: 120,
  lessonDescriptionChars: 1000,
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
