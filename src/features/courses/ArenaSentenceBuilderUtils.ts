import type {
  ArenaSentenceBuilderDeck,
  ArenaSentenceBuilderItemInput,
  ArenaSentenceBuilderQuestion,
} from "../../types/arena";
import { getEntityId } from "../../utils/chat";

export type SentenceBuilderEditorItem = {
  prompt: string;
  answer: string;
  extraTokens: string;
};

export type SentenceBuilderToken = {
  id: string;
  text: string;
};

export const splitAnswerTokens = (value = "") =>
  String(value)
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

export const createEmptySentenceBuilderItem = (): SentenceBuilderEditorItem => ({
  prompt: "",
  answer: "",
  extraTokens: "",
});

export const parsePatternToSentenceBuilderItems = (pattern = ""): SentenceBuilderEditorItem[] =>
  String(pattern)
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const promptLine = lines.find((line) => line.startsWith("$"));
      const answerLine = lines.find(
        (line) =>
          (line.startsWith('"') && line.endsWith('"')) ||
          (line.startsWith("'") && line.endsWith("'")),
      );
      const extraLine = lines.find(
        (line) =>
          (line.startsWith("+") && line.endsWith("+")) ||
          (line.startsWith("`") && line.endsWith("`")),
      );

      return {
        prompt: promptLine ? promptLine.replace(/^\$\s*/, "").trim() : "",
        answer: answerLine ? answerLine.slice(1, -1).trim() : "",
        extraTokens: extraLine ? extraLine.slice(1, -1).trim() : "",
      } satisfies SentenceBuilderEditorItem;
    })
    .filter((item) => item.prompt && item.answer);

export const normalizeSentenceBuilderItemsForPayload = (
  items: SentenceBuilderEditorItem[],
): ArenaSentenceBuilderItemInput[] =>
  items
    .map((item) => ({
      prompt: item.prompt.trim(),
      answer: item.answer.trim(),
      extraTokens: item.extraTokens
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean),
    }))
    .filter((item) => item.prompt && item.answer);

export const shuffleSentenceBuilderTokens = (items: string[]) => {
  const array = [...items];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[nextIndex]] = [array[nextIndex], array[index]];
  }
  return array;
};

export const buildSentenceBuilderOptionTokens = (
  question?: ArenaSentenceBuilderQuestion | null,
): SentenceBuilderToken[] => {
  const sourceTokens = Array.isArray(question?.poolTokens) && question.poolTokens.length
    ? question.poolTokens
    : [...(question?.answerTokens || []), ...(question?.extraTokens || [])];

  return shuffleSentenceBuilderTokens(sourceTokens).map((token, index) => ({
    id: `pool-${index}-${token}`,
    text: token,
  }));
};

export const getSentenceBuilderDeckId = (deck?: ArenaSentenceBuilderDeck | null) =>
  String(deck?._id || deck?.urlSlug || "");

export const getSentenceBuilderCreatorId = (deck?: ArenaSentenceBuilderDeck | null) => {
  if (!deck?.createdBy) {
    return "";
  }

  if (typeof deck.createdBy === "string") {
    return deck.createdBy;
  }

  return getEntityId(deck.createdBy);
};

export const getSentenceBuilderCreatorName = (deck?: ArenaSentenceBuilderDeck | null) => {
  if (!deck?.createdBy) {
    return "Noma'lum";
  }

  if (typeof deck.createdBy === "string") {
    return deck.createdBy;
  }

  return deck.createdBy.nickname || deck.createdBy.name || deck.createdBy.username || "Noma'lum";
};

export const canManageSentenceBuilderDeck = (
  deck: ArenaSentenceBuilderDeck | null,
  currentUserId: string,
) =>
  Boolean(
    currentUserId &&
      (deck?.canEdit === true || getSentenceBuilderCreatorId(deck) === currentUserId),
  );
