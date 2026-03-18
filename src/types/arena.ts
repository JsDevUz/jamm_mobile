export type ArenaTestQuestion = {
  _id?: string;
  questionText?: string;
  question?: string;
  prompt?: string;
  options?: string[];
  correctOptionIndex?: number;
};

export type ArenaTestPayload = {
  _id?: string;
  title?: string;
  description?: string;
  createdBy?:
    | {
        nickname?: string;
        username?: string;
        name?: string;
      }
    | string;
  questions?: ArenaTestQuestion[];
  displayMode?: "single" | "list" | string;
  timeLimit?: number;
  showResults?: boolean;
};

export type ArenaTestQuestionInput = {
  questionText: string;
  options: string[];
  correctOptionIndex: number;
};

export type ArenaTestMutationPayload = {
  title: string;
  description?: string;
  isPublic?: boolean;
  displayMode?: "single" | "list" | string;
  questions: ArenaTestQuestionInput[];
};

export type ArenaTestsResponse = {
  data?: ArenaTestPayload[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

export type ArenaTestResultItem = {
  questionIndex?: number;
  correct?: boolean;
  correctOptionIndex?: number;
};

export type ArenaTestSubmitResult = {
  score?: number;
  total?: number;
  showResults?: boolean;
  results?: ArenaTestResultItem[];
};

export type ArenaBattleParticipant = {
  userId?: string;
  nickname?: string;
  score?: number;
  total?: number;
  answers?: number[];
  results?: ArenaTestResultItem[];
};

export type ArenaTestHistory = {
  _id?: string;
  createdAt?: string;
  participants?: ArenaBattleParticipant[];
};

export type ArenaTestResultsResponse = {
  data?: ArenaTestHistory[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

export type ArenaTestShareLink = {
  _id?: string;
  shortCode?: string;
  groupName?: string;
  persistResults?: boolean;
  showResults?: boolean;
  timeLimit?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ArenaFlashcardCard = {
  _id?: string;
  front?: string;
  frontImage?: string;
  back?: string;
  backImage?: string;
  easeFactor?: number;
  interval?: number;
  repetitions?: number;
  nextReviewDate?: string;
};

export type ArenaFlashcardUserRef =
  | string
  | {
      _id?: string;
      id?: string;
      nickname?: string;
      username?: string;
      name?: string;
      avatar?: string | null;
    };

export type ArenaFlashcardMember = {
  userId?: ArenaFlashcardUserRef;
  joinedAt?: string;
};

export type ArenaFlashcardDeck = {
  _id?: string;
  urlSlug?: string;
  title?: string;
  createdBy?: ArenaFlashcardUserRef;
  cards?: ArenaFlashcardCard[];
  members?: ArenaFlashcardMember[];
  isPublic?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ArenaFlashcardCardInput = {
  front: string;
  frontImage?: string;
  back: string;
  backImage?: string;
};

export type ArenaFlashcardMutationPayload = {
  title: string;
  cards: ArenaFlashcardCardInput[];
  isPublic?: boolean;
};

export type ArenaFlashcardDecksResponse = {
  data?: ArenaFlashcardDeck[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

export type ArenaFlashcardReviewResponse = {
  success?: boolean;
  easeFactor?: number;
  interval?: number;
  repetitions?: number;
  nextReviewDate?: string;
};

export type ArenaFlashcardPromptSide = "front" | "back";
export type ArenaFlashcardStudyMode =
  | "review"
  | "classic"
  | "test"
  | "shooter";

export type ArenaSentenceBuilderQuestion = {
  _id?: string;
  prompt?: string;
  answer?: string;
  answerTokens?: string[];
  extraTokens?: string[];
  poolTokens?: string[];
};

export type ArenaSentenceBuilderDeck = {
  _id?: string;
  urlSlug?: string;
  title?: string;
  description?: string;
  createdBy?:
    | string
    | {
        _id?: string;
        id?: string;
        nickname?: string;
        username?: string;
        name?: string;
      };
  items?: ArenaSentenceBuilderQuestion[];
  canViewAnswers?: boolean;
  canEdit?: boolean;
  timeLimit?: number;
  showResults?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ArenaSentenceBuilderDecksResponse = {
  data?: ArenaSentenceBuilderDeck[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

export type ArenaSentenceBuilderItemInput = {
  prompt: string;
  answer: string;
  extraTokens?: string[];
};

export type ArenaSentenceBuilderMutationPayload = {
  title: string;
  description?: string;
  items?: ArenaSentenceBuilderItemInput[];
  pattern?: string;
};

export type ArenaSentenceBuilderCheckMistake = {
  position?: number;
  expected?: string;
  actual?: string;
};

export type ArenaSentenceBuilderCheckResult = {
  isCorrect?: boolean;
  expected?: string[];
  expectedTokens?: string[];
  selectedTokens?: string[];
  mistakes?: ArenaSentenceBuilderCheckMistake[];
};

export type ArenaSentenceBuilderAttemptItem = {
  questionIndex?: number;
  prompt?: string;
  isCorrect?: boolean;
  selectedTokens?: string[];
  expectedTokens?: string[];
  mistakes?: ArenaSentenceBuilderCheckMistake[];
};

export type ArenaSentenceBuilderSubmitResult = {
  score?: number;
  total?: number;
  accuracy?: number;
  percent?: number;
  showResults?: boolean;
  passed?: boolean;
  minimumScore?: number;
  items?: ArenaSentenceBuilderAttemptItem[];
};

export type ArenaSentenceBuilderShareLink = {
  _id?: string;
  shortCode?: string;
  groupName?: string;
  persistResults?: boolean;
  showResults?: boolean;
  timeLimit?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ArenaSentenceBuilderResultRow = {
  _id?: string;
  participantName?: string;
  groupName?: string;
  createdAt?: string;
  score?: number;
  total?: number;
  accuracy?: number;
  items?: ArenaSentenceBuilderAttemptItem[];
};

export type ArenaSentenceBuilderResultsResponse = {
  data?: ArenaSentenceBuilderResultRow[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

export type ArenaMnemonicMode = "digits" | "words";

export type ArenaMnemonicLeaderboardEntry = {
  rank?: number;
  user?: {
    _id?: string;
    id?: string;
    nickname?: string;
    username?: string;
    avatar?: string | null;
    premiumStatus?: string | null;
    selectedProfileDecorationId?: string | null;
    customProfileDecorationImage?: string | null;
  } | null;
  score?: number;
  total?: number;
  accuracy?: number;
  elapsedMemorizeMs?: number;
};

export type ArenaMnemonicLeaderboardResponse = {
  leaderboard?: ArenaMnemonicLeaderboardEntry[];
  currentUserBest?: ArenaMnemonicLeaderboardEntry | null;
};

export type ArenaMnemonicSavePayload = {
  mode: ArenaMnemonicMode;
  score: number;
  total: number;
  elapsedMemorizeMs: number;
};
