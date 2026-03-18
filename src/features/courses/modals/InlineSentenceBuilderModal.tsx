import { useEffect, useState } from "react";
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
import { arenaApi } from "../../../lib/api";
import { Colors } from "../../../theme/colors";
import type { CourseLinkedTest } from "../../../types/courses";

type SentenceBuilderQuestion = {
  prompt?: string;
  poolTokens?: string[];
};

export type SentenceBuilderDeck = {
  _id?: string;
  title?: string;
  items?: SentenceBuilderQuestion[];
};

type Props = {
  visible: boolean;
  deck: SentenceBuilderDeck | null;
  linkedTest: CourseLinkedTest | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    sentenceBuilderAnswers: Array<{ questionIndex: number; selectedTokens: string[] }>;
  }) => Promise<Record<string, unknown> | null>;
  styles: any;
};

export function InlineSentenceBuilderModal({
  visible,
  deck,
  linkedTest,
  loading,
  onClose,
  onSubmit,
  styles,
}: Props) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [poolTokens, setPoolTokens] = useState<string[]>([]);
  const [answerMap, setAnswerMap] = useState<Record<number, string[]>>({});
  const [checkedResult, setCheckedResult] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const items = deck?.items || [];
  const currentQuestion = items[questionIndex];

  useEffect(() => {
    if (!visible) {
      setQuestionIndex(0);
      setSelectedTokens([]);
      setPoolTokens([]);
      setAnswerMap({});
      setCheckedResult(null);
      setSummary(null);
      setChecking(false);
      setSubmitting(false);
      setTimeLeft(0);
      return;
    }

    setQuestionIndex(0);
    setSelectedTokens([]);
    setPoolTokens(currentQuestion?.poolTokens || []);
    setAnswerMap({});
    setCheckedResult(null);
    setSummary(null);
    setChecking(false);
    setSubmitting(false);
    setTimeLeft(Math.max(0, Number(linkedTest?.timeLimit || 0) * 60));
  }, [currentQuestion?.poolTokens, linkedTest?.timeLimit, visible]);

  useEffect(() => {
    if (!currentQuestion || summary) {
      return;
    }

    setSelectedTokens(answerMap[questionIndex] || []);
    setPoolTokens(
      (currentQuestion.poolTokens || []).filter(
        (token) => !(answerMap[questionIndex] || []).includes(token),
      ),
    );
    setCheckedResult(null);
  }, [currentQuestion, questionIndex, summary]);

  useEffect(() => {
    if (!visible || !timeLeft || summary || submitting) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [submitting, summary, timeLeft, visible]);

  const finish = async (nextMap = answerMap) => {
    setSubmitting(true);
    try {
      const sentenceBuilderAnswers = Object.entries(nextMap).map(([idx, selected]) => ({
        questionIndex: Number(idx),
        selectedTokens: selected,
      }));
      setSummary(await onSubmit({ sentenceBuilderAnswers }));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!visible || timeLeft !== 0 || summary || submitting) {
      return;
    }

    void finish(answerMap);
  }, [answerMap, submitting, summary, timeLeft, visible]);

  const handleCheck = async () => {
    if (!deck?._id || !selectedTokens.length) return;
    setChecking(true);
    try {
      const result = await arenaApi.checkSentenceBuilderAnswer(deck._id, questionIndex, selectedTokens);
      setCheckedResult(result);
      setAnswerMap((prev) => ({ ...prev, [questionIndex]: selectedTokens }));
    } finally {
      setChecking(false);
    }
  };

  const handleChooseToken = (token: string, index: number) => {
    if (checkedResult) return;
    setPoolTokens((prev) => prev.filter((_, tokenIndex) => !(prev[tokenIndex] === token && tokenIndex === index)));
    setSelectedTokens((prev) => [...prev, token]);
  };

  const handleRemoveToken = (token: string, index: number) => {
    if (checkedResult) return;
    setSelectedTokens((prev) => prev.filter((_, tokenIndex) => tokenIndex !== index));
    setPoolTokens((prev) => [...prev, token]);
  };

  const handleNext = async () => {
    const nextAnswerMap = { ...answerMap, [questionIndex]: selectedTokens };
    if (questionIndex >= items.length - 1) {
      await finish(nextAnswerMap);
      return;
    }

    setQuestionIndex((prev) => prev + 1);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.runnerSafeArea} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.runnerHeader}>
          <Pressable style={styles.headerButton} onPress={onClose}>
            <ArrowLeft size={18} color={Colors.text} />
          </Pressable>
          <Text style={styles.runnerTitle} numberOfLines={1}>
            {linkedTest?.title || deck?.title || "Sentence Builder"}
          </Text>
          <View style={styles.runnerMetaPill}>
            <Text style={styles.runnerMetaPillText}>
              {timeLeft > 0
                ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`
                : `${items.length} gap`}
            </Text>
          </View>
        </View>

        {loading && !deck ? (
          <View style={styles.runnerCenterState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : summary ? (
          <ScrollView contentContainerStyle={styles.runnerResultContent} showsVerticalScrollIndicator={false}>
            <View style={styles.runnerSummaryCard}>
              <Text style={styles.runnerSummaryValue}>{Number(summary.score || 0)}</Text>
              <Text style={styles.runnerSummaryLabel}>To'g'ri gaplar</Text>
            </View>
            <View style={styles.runnerSummaryGrid}>
              <View style={styles.runnerSummaryStat}>
                <Text style={styles.runnerSummaryStatValue}>{Number(summary.percent || 0)}%</Text>
                <Text style={styles.runnerSummaryStatLabel}>Aniqlik</Text>
              </View>
              <View style={styles.runnerSummaryStat}>
                <Text style={styles.runnerSummaryStatValue}>{Number(summary.minimumScore || 0)}%</Text>
                <Text style={styles.runnerSummaryStatLabel}>Minimum</Text>
              </View>
              <View style={styles.runnerSummaryStat}>
                <Text style={styles.runnerSummaryStatValue}>{summary.passed ? "Passed" : "Retry"}</Text>
                <Text style={styles.runnerSummaryStatLabel}>Holat</Text>
              </View>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.runnerBody}>
            <View style={styles.runnerProgressBar}>
              <View
                style={[
                  styles.runnerProgressFill,
                  { width: `${items.length ? ((questionIndex + 1) / items.length) * 100 : 0}%` },
                ]}
              />
            </View>
            <View style={styles.runnerQuestionCard}>
              <Text style={styles.runnerQuestionCounter}>
                {questionIndex + 1} / {items.length}
              </Text>
              <Text style={styles.runnerQuestionText}>{currentQuestion?.prompt || "Gapni tuzing"}</Text>

              <View style={styles.builderDropZone}>
                {selectedTokens.length ? (
                  selectedTokens.map((token, index) => (
                    <Pressable
                      key={`${token}-${index}`}
                      style={styles.builderTokenSelected}
                      onPress={() => handleRemoveToken(token, index)}
                    >
                      <Text style={styles.builderTokenText}>{token}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.sectionHint}>Javobni shu yerga tering.</Text>
                )}
              </View>

              <View style={styles.builderPoolWrap}>
                {(poolTokens || []).map((token, index) => (
                  <Pressable
                    key={`${token}-${index}`}
                    style={styles.builderToken}
                    onPress={() => handleChooseToken(token, index)}
                  >
                    <Text style={styles.builderTokenText}>{token}</Text>
                  </Pressable>
                ))}
              </View>

              {checkedResult ? (
                <View style={styles.builderFeedback}>
                  <Text style={styles.progressBadgeText}>
                    {checkedResult.isCorrect ? "To'g'ri" : "Xato"}
                  </Text>
                  {Array.isArray(checkedResult.expected) ? (
                    <View style={styles.builderPoolWrap}>
                      {(checkedResult.expected as string[]).map((token, index) => (
                        <View key={`${token}-${index}`} style={styles.builderTokenExpected}>
                          <Text style={styles.builderTokenText}>{token}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        )}

        {!summary ? (
          <View style={styles.runnerFooter}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            {checkedResult ? (
              <Pressable style={styles.primaryButton} onPress={() => void handleNext()} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {questionIndex >= items.length - 1 ? "Yakunlash" : "Keyingi"}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={[styles.primaryButton, (!selectedTokens.length || checking) && styles.sendButtonDisabled]}
                disabled={!selectedTokens.length || checking}
                onPress={() => void handleCheck()}
              >
                {checking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Tekshirish</Text>
                )}
              </Pressable>
            )}
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
