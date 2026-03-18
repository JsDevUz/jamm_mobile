import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../../theme/colors";
import type { CourseLinkedTest } from "../../../types/courses";
import type { ArenaTestPayload } from "../../../types/arena";

type Props = {
  visible: boolean;
  test: ArenaTestPayload | null;
  linkedTest: CourseLinkedTest | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: { answers: number[] }) => Promise<Record<string, unknown> | null>;
  styles: any;
};

export function InlineTestPlayerModal({
  visible,
  test,
  linkedTest,
  loading,
  onClose,
  onSubmit,
  styles,
}: Props) {
  const questions = useMemo(() => test?.questions || [], [test?.questions]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [singleAnswers, setSingleAnswers] = useState<number[]>([]);
  const [listAnswers, setListAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const displayMode = test?.displayMode === "list" ? "list" : "single";
  const currentQuestion = questions[currentIdx];

  useEffect(() => {
    if (!visible) {
      setCurrentIdx(0);
      setSingleAnswers([]);
      setListAnswers({});
      setSubmitting(false);
      setResult(null);
      setTimeLeft(0);
      return;
    }

    setCurrentIdx(0);
    setSingleAnswers([]);
    setListAnswers({});
    setSubmitting(false);
    setResult(null);
    setTimeLeft(Math.max(0, Number(test?.timeLimit || linkedTest?.timeLimit || 0) * 60));
  }, [linkedTest?.timeLimit, test?.timeLimit, visible]);

  useEffect(() => {
    if (!visible || !timeLeft || result || submitting) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [result, submitting, timeLeft, visible]);

  useEffect(() => {
    if (!visible || timeLeft !== 0 || result || submitting) {
      return;
    }

    const answers = questions.map((_, index) =>
      displayMode === "list" ? listAnswers[index] ?? -1 : singleAnswers[index] ?? -1,
    );
    void (async () => {
      setSubmitting(true);
      try {
        setResult(await onSubmit({ answers }));
      } finally {
        setSubmitting(false);
      }
    })();
  }, [displayMode, listAnswers, onSubmit, questions, result, singleAnswers, submitting, timeLeft, visible]);

  const selectOption = (questionIndex: number, optionIndex: number) => {
    if (displayMode === "list") {
      setListAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }));
      return;
    }

    setSingleAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
  };

  const handleNext = async () => {
    if (displayMode !== "single") return;
    if (singleAnswers[currentIdx] === undefined) return;
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      return;
    }

    setSubmitting(true);
    try {
      setResult(await onSubmit({ answers: questions.map((_, index) => singleAnswers[index] ?? -1) }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleListSubmit = async () => {
    setSubmitting(true);
    try {
      setResult(await onSubmit({ answers: questions.map((_, index) => listAnswers[index] ?? -1) }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.runnerSafeArea} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.runnerHeader}>
          <Pressable style={styles.headerButton} onPress={onClose}>
            <ArrowLeft size={18} color={Colors.text} />
          </Pressable>
          <Text style={styles.runnerTitle} numberOfLines={1}>
            {linkedTest?.title || test?.title || "Maydon testi"}
          </Text>
          <View style={styles.runnerMetaPill}>
            <Text style={styles.runnerMetaPillText}>
              {timeLeft > 0
                ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`
                : `${questions.length} savol`}
            </Text>
          </View>
        </View>

        {loading && !test ? (
          <View style={styles.runnerCenterState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : result ? (
          <ScrollView contentContainerStyle={styles.runnerResultContent} showsVerticalScrollIndicator={false}>
            <View style={styles.runnerSummaryCard}>
              <Text style={styles.runnerSummaryValue}>{Number(result.score || 0)}</Text>
              <Text style={styles.runnerSummaryLabel}>To'g'ri javob</Text>
            </View>
            <View style={styles.runnerSummaryGrid}>
              <View style={styles.runnerSummaryStat}>
                <Text style={styles.runnerSummaryStatValue}>{Number(result.percent || 0)}%</Text>
                <Text style={styles.runnerSummaryStatLabel}>Aniqlik</Text>
              </View>
              <View style={styles.runnerSummaryStat}>
                <Text style={styles.runnerSummaryStatValue}>{Number(result.minimumScore || 0)}%</Text>
                <Text style={styles.runnerSummaryStatLabel}>Minimum</Text>
              </View>
              <View style={styles.runnerSummaryStat}>
                <Text style={styles.runnerSummaryStatValue}>
                  {result.passed ? "Passed" : "Retry"}
                </Text>
                <Text style={styles.runnerSummaryStatLabel}>Holat</Text>
              </View>
            </View>
            {Array.isArray(result.results) && result.showResults !== false ? (
              <View style={styles.runnerBreakdownList}>
                {result.results.map((item, index) => {
                  const resultItem = item as {
                    questionIndex?: number;
                    correct?: boolean;
                    correctOptionIndex?: number;
                  };
                  const question =
                    questions[resultItem.questionIndex ?? index] || questions[index];
                  const selectedIndex =
                    displayMode === "list"
                      ? listAnswers[resultItem.questionIndex ?? index]
                      : singleAnswers[resultItem.questionIndex ?? index];

                  return (
                    <View key={`result-${index}`} style={styles.runnerBreakdownCard}>
                      <Text style={styles.runnerBreakdownQuestion}>
                        {question?.questionText ||
                          question?.question ||
                          question?.prompt ||
                          `${index + 1}-savol`}
                      </Text>
                      {(question?.options || []).map((option, optionIndex) => {
                        const isCorrect = resultItem.correctOptionIndex === optionIndex;
                        const isSelected = selectedIndex === optionIndex;

                        return (
                          <View
                            key={`${option}-${optionIndex}`}
                            style={[
                              styles.runnerOptionReview,
                              isCorrect && styles.runnerOptionReviewCorrect,
                              isSelected && !isCorrect && styles.runnerOptionReviewSelected,
                            ]}
                          >
                            <Text style={styles.runnerOptionReviewText}>{option}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        ) : displayMode === "list" ? (
          <ScrollView contentContainerStyle={styles.runnerBody} showsVerticalScrollIndicator={false}>
            {questions.map((question, questionIndex) => (
              <View key={`question-${questionIndex}`} style={styles.runnerQuestionCard}>
                <Text style={styles.runnerQuestionText}>
                  {question.questionText ||
                    question.question ||
                    question.prompt ||
                    `${questionIndex + 1}-savol`}
                </Text>
                <View style={styles.runnerOptionsList}>
                  {(question.options || []).map((option, optionIndex) => (
                    <Pressable
                      key={`${option}-${optionIndex}`}
                      style={[
                        styles.runnerOptionButton,
                        listAnswers[questionIndex] === optionIndex && styles.runnerOptionButtonActive,
                      ]}
                      onPress={() => selectOption(questionIndex, optionIndex)}
                    >
                      <Text style={styles.runnerOptionLabel}>{String.fromCharCode(65 + optionIndex)}</Text>
                      <Text
                        style={[
                          styles.runnerOptionText,
                          listAnswers[questionIndex] === optionIndex && styles.runnerOptionTextActive,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.runnerBody}>
            <View style={styles.runnerProgressBar}>
              <View
                style={[
                  styles.runnerProgressFill,
                  { width: `${questions.length ? ((currentIdx + 1) / questions.length) * 100 : 0}%` },
                ]}
              />
            </View>
            <View style={styles.runnerQuestionCard}>
              <Text style={styles.runnerQuestionCounter}>
                {currentIdx + 1} / {questions.length}
              </Text>
              <Text style={styles.runnerQuestionText}>
                {currentQuestion?.questionText ||
                  currentQuestion?.question ||
                  currentQuestion?.prompt ||
                  "Savol"}
              </Text>
              <View style={styles.runnerOptionsList}>
                {(currentQuestion?.options || []).map((option, optionIndex) => (
                  <Pressable
                    key={`${option}-${optionIndex}`}
                    style={[
                      styles.runnerOptionButton,
                      singleAnswers[currentIdx] === optionIndex && styles.runnerOptionButtonActive,
                    ]}
                    onPress={() => selectOption(currentIdx, optionIndex)}
                  >
                    <Text style={styles.runnerOptionLabel}>{String.fromCharCode(65 + optionIndex)}</Text>
                    <Text
                      style={[
                        styles.runnerOptionText,
                        singleAnswers[currentIdx] === optionIndex && styles.runnerOptionTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {!result ? (
          <View style={styles.runnerFooter}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, submitting && styles.sendButtonDisabled]}
              disabled={
                submitting ||
                (displayMode === "single"
                  ? singleAnswers[currentIdx] === undefined
                  : questions.some((_, index) => listAnswers[index] === undefined))
              }
              onPress={() => void (displayMode === "single" ? handleNext() : handleListSubmit())}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {displayMode === "single" && currentIdx < questions.length - 1
                    ? "Keyingi"
                    : "Yakunlash"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.runnerFooter}>
            <Pressable style={styles.primaryButton} onPress={onClose}>
              <Text style={styles.primaryButtonText}>Yopish</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
