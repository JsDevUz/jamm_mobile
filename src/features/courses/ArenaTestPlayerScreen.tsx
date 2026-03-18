import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Timer,
  XCircle,
} from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { arenaApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import { Colors } from "../../theme/colors";
import type {
  ArenaTestPayload,
  ArenaTestQuestion,
  ArenaTestSubmitResult,
} from "../../types/arena";

type Props = NativeStackScreenProps<RootStackParamList, "ArenaTestPlayer">;

const LETTERS = ["A", "B", "D", "E", "F", "G"];

function getQuestionText(question?: ArenaTestQuestion | null, index?: number) {
  return (
    question?.questionText ||
    question?.question ||
    question?.prompt ||
    `${Number(index || 0) + 1}-savol`
  );
}

function getOptionLetter(index: number) {
  return LETTERS[index] || String.fromCharCode(65 + index);
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function ArenaTestPlayerScreen({ navigation, route }: Props) {
  const seededTest = route.params.test ?? null;
  const testId = String(route.params.testId || seededTest?._id || "");
  const shareShortCode = route.params.shareShortCode || null;

  const testQuery = useQuery<ArenaTestPayload>({
    queryKey: ["arena-test", testId],
    queryFn: () => arenaApi.fetchTestById(testId) as Promise<ArenaTestPayload>,
    enabled: Boolean(
      testId &&
        (!seededTest || !Array.isArray(seededTest.questions) || seededTest.questions.length === 0),
    ),
  });

  const test = testQuery.data || seededTest;
  const questions = useMemo(
    () => (Array.isArray(test?.questions) ? test.questions : []),
    [test?.questions],
  );
  const displayMode = test?.displayMode === "list" ? "list" : "single";
  const configuredTimeLimit = Math.max(0, Number(test?.timeLimit || 0));

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [singleAnswers, setSingleAnswers] = useState<number[]>([]);
  const [listAnswers, setListAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(configuredTimeLimit * 60);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ArenaTestSubmitResult | null>(null);
  const [submittedAnswers, setSubmittedAnswers] = useState<number[]>([]);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitPromptVisibleRef = useRef(false);
  const currentQuestion = questions[currentIdx] || null;
  const canLeaveScreen = !test?._id || Boolean(result);

  const handleReturnToQuizList = useCallback(() => {
    navigation.navigate("ArenaQuizList");
  }, [navigation]);

  useEffect(() => {
    setCurrentIdx(0);
    setSelectedOption(null);
    setIsRevealed(false);
    setSingleAnswers([]);
    setListAnswers({});
    setTimeLeft(configuredTimeLimit * 60);
    setSubmitting(false);
    setResult(null);
    setSubmittedAnswers([]);
  }, [configuredTimeLimit, test?._id]);

  useEffect(() => {
    return () => {
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
      }
    };
  }, []);

  const getCurrentAnswers = useCallback(() => {
    if (displayMode === "list") {
      return questions.map((_, index) => listAnswers[index] ?? -1);
    }

    return questions.map((_, index) => singleAnswers[index] ?? -1);
  }, [displayMode, listAnswers, questions, singleAnswers]);

  const submitAnswers = useCallback(
    async (answers: number[]) => {
      if (!test?._id) {
        return;
      }

      setSubmitting(true);
      setSubmittedAnswers(answers);

      try {
        const payload = (await arenaApi.submitTestAnswers(test._id, {
          answers,
          shareShortCode,
        })) as ArenaTestSubmitResult;
        setResult(payload);
      } catch (error) {
        Alert.alert(
          "Test yakunlanmadi",
          error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [shareShortCode, test?._id],
  );

  useEffect(() => {
    if (configuredTimeLimit <= 0 || result || submitting || timeLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [configuredTimeLimit, result, submitting, timeLeft]);

  useEffect(() => {
    if (
      configuredTimeLimit <= 0 ||
      timeLeft !== 0 ||
      result ||
      submitting ||
      !test?._id
    ) {
      return;
    }

    void submitAnswers(getCurrentAnswers());
  }, [
    configuredTimeLimit,
    getCurrentAnswers,
    result,
    submitAnswers,
    submitting,
    test?._id,
    timeLeft,
  ]);

  const handleAttemptExit = useCallback(() => {
    if (canLeaveScreen) {
      handleReturnToQuizList();
      return;
    }

    if (submitting || exitPromptVisibleRef.current) {
      return;
    }

    exitPromptVisibleRef.current = true;

    Alert.alert(
      "Testni yakunlaysizmi?",
      "Hozirgi natijangiz qabul qilinadi. Javob bermagan savollaringiz 0 ball hisoblanadi.",
      [
        {
          text: "Davom etish",
          style: "cancel",
          onPress: () => {
            exitPromptVisibleRef.current = false;
          },
        },
        {
          text: "Chiqish",
          style: "destructive",
          onPress: () => {
            exitPromptVisibleRef.current = false;
            void submitAnswers(getCurrentAnswers());
          },
        },
      ],
      {
        cancelable: false,
      },
    );
  }, [canLeaveScreen, getCurrentAnswers, handleReturnToQuizList, submitAnswers, submitting]);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: canLeaveScreen,
    });

    return () => {
      navigation.setOptions({
        gestureEnabled: true,
      });
    };
  }, [canLeaveScreen, navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (canLeaveScreen) {
        return;
      }

      event.preventDefault();

      if (submitting) {
        return;
      }

      handleAttemptExit();
    });

    return unsubscribe;
  }, [canLeaveScreen, handleAttemptExit, navigation, submitting]);

  const handleSingleSelect = (optionIndex: number) => {
    if (isRevealed || submitting || result || !questions.length) {
      return;
    }

    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current);
    }

    setSelectedOption(optionIndex);
    setIsRevealed(true);
    setSingleAnswers((prev) => {
      const next = [...prev];
      next[currentIdx] = optionIndex;
      return next;
    });

    const nextAnswers = questions.map((_, index) =>
      index === currentIdx ? optionIndex : singleAnswers[index] ?? -1,
    );

    revealTimeoutRef.current = setTimeout(() => {
      setSelectedOption(null);
      setIsRevealed(false);

      if (currentIdx + 1 < questions.length) {
        setCurrentIdx((value) => value + 1);
        return;
      }

      void submitAnswers(nextAnswers);
    }, 300);
  };

  const handleListSelect = (questionIndex: number, optionIndex: number) => {
    if (result || submitting) {
      return;
    }

    setListAnswers((prev) => ({
      ...prev,
      [questionIndex]: optionIndex,
    }));
  };

  const showResults = result?.showResults ?? (test?.showResults ?? true);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <Pressable style={styles.backButton} onPress={handleAttemptExit}>
              <ArrowLeft size={20} color={Colors.mutedText} />
              <Text style={styles.backButtonText}>Orqaga</Text>
            </Pressable>

            <View style={styles.headerMetaRow}>
              {configuredTimeLimit > 0 ? (
                <View style={styles.timerWrap}>
                  <Timer size={16} color={timeLeft <= 60 ? Colors.danger : Colors.primary} />
                  <Text
                    style={[
                      styles.timerText,
                      timeLeft <= 60 && styles.timerTextDanger,
                    ]}
                  >
                    {formatTime(timeLeft)}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.progressText}>
                {displayMode === "single"
                  ? `${Math.min(currentIdx + 1, Math.max(questions.length, 1))} / ${questions.length}`
                  : `${questions.length} ta savol`}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{test?.title || "Test"}</Text>
        </View>

        {testQuery.isLoading && !test ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : testQuery.isError && !test ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>Test ochilmadi</Text>
            <Text style={styles.stateText}>
              Bu testni qayta yuklab ko'ring.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => void testQuery.refetch()}
            >
              <Text style={styles.primaryButtonText}>Qayta yuklash</Text>
            </Pressable>
          </View>
        ) : submitting ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.stateTitle}>Javoblar tekshirilmoqda...</Text>
          </View>
        ) : result ? (
          <ScrollView
            contentContainerStyle={styles.resultContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.resultTitle}>Test yakunlandi!</Text>

            {showResults && Array.isArray(result.results) ? (
              <>
                <Text style={styles.scoreText}>
                  {Number(result.score || 0)} / {Number(result.total || questions.length)}
                </Text>
                <Text style={styles.scoreCaption}>To'g'ri javoblar</Text>

                <View style={styles.breakdownList}>
                  {questions.map((question, index) => {
                    const resultItem =
                      result.results?.find((item) => item.questionIndex === index) || null;
                    const selectedIndex = submittedAnswers[index];
                    const selectedText =
                      selectedIndex >= 0 ? question.options?.[selectedIndex] : "Javob berilmagan";
                    const correctText =
                      typeof resultItem?.correctOptionIndex === "number" &&
                      resultItem.correctOptionIndex >= 0
                        ? question.options?.[resultItem.correctOptionIndex]
                        : "Ma'lumot yo'q";

                    return (
                      <View
                        key={question._id || `result-${index}`}
                        style={[
                          styles.resultQuestionCard,
                          resultItem?.correct
                            ? styles.resultQuestionCardCorrect
                            : styles.resultQuestionCardWrong,
                        ]}
                      >
                        <View style={styles.resultRow}>
                          <Text style={styles.resultQuestionTitle}>
                            {index + 1}. {getQuestionText(question, index)}
                          </Text>

                          <View
                            style={[
                              styles.resultBadge,
                              resultItem?.correct
                                ? styles.resultBadgeCorrect
                                : styles.resultBadgeWrong,
                            ]}
                          >
                            {resultItem?.correct ? (
                              <CheckCircle2 size={14} color="#22c55e" />
                            ) : (
                              <XCircle size={14} color="#ef4444" />
                            )}
                            <Text
                              style={[
                                styles.resultBadgeText,
                                resultItem?.correct
                                  ? styles.resultBadgeTextCorrect
                                  : styles.resultBadgeTextWrong,
                              ]}
                            >
                              {resultItem?.correct ? "To'g'ri" : "Xato"}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.resultInfoText}>
                          Sizning javobingiz:{" "}
                          <Text style={styles.resultInfoStrong}>{selectedText}</Text>
                        </Text>
                        <Text style={styles.resultInfoText}>
                          To'g'ri javob:{" "}
                          <Text style={styles.resultInfoStrongCorrect}>{correctText}</Text>
                        </Text>

                        <View style={styles.resultOptionsList}>
                          {(question.options || []).map((option, optionIndex) => {
                            const isSelected = selectedIndex === optionIndex;
                            const isCorrect = resultItem?.correctOptionIndex === optionIndex;

                            return (
                              <View
                                key={`${question._id || index}-${optionIndex}`}
                                style={[
                                  styles.resultOptionItem,
                                  isSelected && styles.resultOptionItemSelected,
                                  isCorrect && styles.resultOptionItemCorrect,
                                ]}
                              >
                                <Text style={styles.resultOptionText}>
                                  {getOptionLetter(optionIndex)}. {option}
                                </Text>

                                {(isSelected || isCorrect) && (
                                  <View style={styles.resultOptionMeta}>
                                    {isSelected && (
                                      <View
                                        style={[
                                          styles.resultTag,
                                          isCorrect
                                            ? styles.resultTagSelectedCorrect
                                            : styles.resultTagSelected,
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.resultTagText,
                                            isCorrect
                                              ? styles.resultTagTextSelectedCorrect
                                              : styles.resultTagTextSelected,
                                          ]}
                                        >
                                          {isCorrect ? "Siz tanlagan va to'g'ri" : "Siz tanlagan"}
                                        </Text>
                                      </View>
                                    )}

                                    {isCorrect && !isSelected ? (
                                      <View style={[styles.resultTag, styles.resultTagCorrect]}>
                                        <Text
                                          style={[
                                            styles.resultTagText,
                                            styles.resultTagTextCorrect,
                                          ]}
                                        >
                                          To'g'ri javob
                                        </Text>
                                      </View>
                                    ) : null}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <View style={styles.simpleDoneIcon}>
                  <CheckCircle2 size={58} color={Colors.primary} />
                </View>
                <Text style={styles.stateText}>Javoblaringiz saqlandi.</Text>
              </>
            )}

            <Pressable style={styles.primaryButtonWide} onPress={handleReturnToQuizList}>
              <Text style={styles.primaryButtonText}>Testlar ro'yxatiga qaytish</Text>
            </Pressable>
          </ScrollView>
        ) : !test || questions.length === 0 || !currentQuestion ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>Savollar topilmadi</Text>
            <Text style={styles.stateText}>
              Test ichida kamida bitta savol bo'lishi kerak.
            </Text>
          </View>
        ) : displayMode === "single" ? (
          <ScrollView
            contentContainerStyle={styles.singleContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.questionBox}>
              <Text style={styles.questionText}>{getQuestionText(currentQuestion, currentIdx)}</Text>
            </View>

            <View style={styles.optionsGrid}>
              {(currentQuestion.options || []).map((option, optionIndex) => {
                const isSelected = selectedOption === optionIndex;

                return (
                  <Pressable
                    key={`${currentIdx}-${optionIndex}`}
                    style={[
                      styles.optionButton,
                      isSelected && styles.optionButtonSelected,
                    ]}
                    disabled={isRevealed}
                    onPress={() => handleSingleSelect(optionIndex)}
                  >
                    <View
                      style={[
                        styles.optionLetter,
                        isSelected && styles.optionLetterSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionLetterText,
                          isSelected && styles.optionLetterTextSelected,
                        ]}
                      >
                        {getOptionLetter(optionIndex)}
                      </Text>
                    </View>

                    <Text style={styles.optionText}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listModeContent}
            showsVerticalScrollIndicator={false}
          >
            {questions.map((question, questionIndex) => (
              <View key={question._id || `question-${questionIndex}`} style={styles.listQuestionBlock}>
                <View style={styles.questionBox}>
                  <View style={styles.listQuestionRow}>
                    <Text style={styles.listQuestionIndex}>{questionIndex + 1}.</Text>
                    <Text style={styles.questionText}>{getQuestionText(question, questionIndex)}</Text>
                  </View>
                </View>

                <View style={styles.optionsGrid}>
                  {(question.options || []).map((option, optionIndex) => {
                    const isSelected = listAnswers[questionIndex] === optionIndex;

                    return (
                      <Pressable
                        key={`${questionIndex}-${optionIndex}`}
                        style={[
                          styles.optionButton,
                          isSelected && styles.optionButtonSelected,
                        ]}
                        onPress={() => handleListSelect(questionIndex, optionIndex)}
                      >
                        <View
                          style={[
                            styles.optionLetter,
                            isSelected && styles.optionLetterSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionLetterText,
                              isSelected && styles.optionLetterTextSelected,
                            ]}
                          >
                            {getOptionLetter(optionIndex)}
                          </Text>
                        </View>

                        <Text style={styles.optionText}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <Pressable
              style={styles.primaryButtonWide}
              onPress={() => void submitAnswers(getCurrentAnswers())}
            >
              <Text style={styles.primaryButtonText}>Yakunlash</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backButtonText: {
    color: Colors.mutedText,
    fontSize: 16,
    fontWeight: "600",
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  timerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timerText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  timerTextDanger: {
    color: Colors.danger,
  },
  progressText: {
    color: Colors.mutedText,
    fontSize: 14,
  },
  title: {
    marginTop: 16,
    color: Colors.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  stateTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  stateText: {
    color: Colors.mutedText,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  singleContent: {
    padding: 16,
    gap: 16,
  },
  listModeContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 32,
  },
  listQuestionBlock: {
    gap: 16,
  },
  questionBox: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 16,
  },
  listQuestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  listQuestionIndex: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  questionText: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    lineHeight: 27,
    fontWeight: "500",
  },
  optionsGrid: {
    gap: 12,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  optionButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  optionLetter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLetterSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  optionLetterText: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "700",
  },
  optionLetterTextSelected: {
    color: "#fff",
  },
  optionText: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  resultContent: {
    padding: 24,
    paddingBottom: 32,
    alignItems: "center",
    gap: 24,
  },
  resultTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  scoreText: {
    color: Colors.primary,
    fontSize: 44,
    fontWeight: "800",
  },
  scoreCaption: {
    color: Colors.mutedText,
    fontSize: 18,
    marginTop: -12,
  },
  simpleDoneIcon: {
    marginTop: 12,
  },
  breakdownList: {
    width: "100%",
    gap: 12,
  },
  resultQuestionCard: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    gap: 10,
  },
  resultQuestionCardCorrect: {
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  resultQuestionCardWrong: {
    borderColor: "rgba(239, 68, 68, 0.28)",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  resultQuestionTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
  },
  resultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  resultBadgeCorrect: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
  },
  resultBadgeWrong: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  resultBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  resultBadgeTextCorrect: {
    color: "#22c55e",
  },
  resultBadgeTextWrong: {
    color: "#ef4444",
  },
  resultInfoText: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  resultInfoStrong: {
    color: Colors.text,
    fontWeight: "700",
  },
  resultInfoStrongCorrect: {
    color: "#22c55e",
    fontWeight: "700",
  },
  resultOptionsList: {
    gap: 8,
  },
  resultOptionItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  resultOptionItemSelected: {
    borderColor: "rgba(239, 68, 68, 0.28)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  resultOptionItemCorrect: {
    borderColor: "rgba(34, 197, 94, 0.3)",
    backgroundColor: "rgba(34, 197, 94, 0.08)",
  },
  resultOptionText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  resultOptionMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  resultTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  resultTagCorrect: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
  },
  resultTagSelected: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  resultTagSelectedCorrect: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
  },
  resultTagText: {
    fontSize: 12,
    fontWeight: "700",
  },
  resultTagTextCorrect: {
    color: "#22c55e",
  },
  resultTagTextSelected: {
    color: "#ef4444",
  },
  resultTagTextSelectedCorrect: {
    color: "#60a5fa",
  },
  primaryButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonWide: {
    minHeight: 48,
    minWidth: 220,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
