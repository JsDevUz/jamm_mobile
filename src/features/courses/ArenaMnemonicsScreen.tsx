import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput as NativeTextInput,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Play,
  X,
} from "lucide-react-native";
import { Avatar } from "../../components/Avatar";
import { TextInput } from "../../components/TextInput";
import { UserDisplayName } from "../../components/UserDisplayName";
import { arenaApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type {
  ArenaMnemonicLeaderboardEntry,
  ArenaMnemonicMode,
} from "../../types/arena";
import { getEntityId } from "../../utils/chat";
import { getMnemonicWords, MNEMONIC_WORD_POOL_SIZE } from "./mnemonicWordPool";

type Props = NativeStackScreenProps<RootStackParamList, "ArenaMnemonics">;
type MnemonicPhase =
  | "setup"
  | "prepare-memorize"
  | "memorize"
  | "prepare-recall"
  | "recall"
  | "result";
type MnemonicResult = {
  score: number;
  total: number;
  expected: string[];
  actual: string[];
  elapsedMemorizeMs: number;
};

const MAX_ITEMS = 40;
const PREPARE_SECONDS = 10;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const createDigits = (count: number) =>
  Array.from({ length: count }, () => String(Math.floor(Math.random() * 10)));

const normalizeWord = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const formatCountdown = (value: number) => {
  const safeValue = Math.max(0, value);
  return `${Math.floor(safeValue / 60)}:${String(safeValue % 60).padStart(2, "0")}`;
};

const formatMemorizeSeconds = (value: number) =>
  `${(Math.max(0, value) / 1000).toFixed(2)} sek`;

const chunkItems = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getNormalizedLocaleLanguage = () => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
    const normalized = locale.split("-")[0]?.toLowerCase();
    if (normalized === "uz" || normalized === "ru" || normalized === "en") {
      return normalized;
    }
  } catch {
    return "en";
  }

  return "en";
};

const getLeaderboardUserLabel = (entry?: ArenaMnemonicLeaderboardEntry | null) =>
  entry?.user?.nickname || entry?.user?.username || "User";

const getPhaseSubtitle = (phase: MnemonicPhase, mode: ArenaMnemonicMode) => {
  if (phase === "prepare-memorize") {
    return "Taymer tugashi bilan mashq boshlanadi.";
  }
  if (phase === "memorize") {
    return mode === "digits"
      ? "Ketma-ketlikni eslab qoling."
      : "Berilgan so'zlarni diqqat bilan yodlang.";
  }
  if (phase === "prepare-recall") {
    return "Endi yodlanganlarini qayta kiriting.";
  }
  if (phase === "recall") {
    return mode === "digits"
      ? "Klaviatura orqali har bir raqamni qayta kiriting."
      : "Har bir so'zni o'z joyiga yozing.";
  }
  if (phase === "result") {
    return "To'g'ri va xato javoblar quyida ko'rsatilgan.";
  }
  return "Frontend oqimiga mos mnemonics mashqi.";
};

export function ArenaMnemonicsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = String(currentUser?._id || currentUser?.id || "");
  const wordInputRefs = useRef<Array<NativeTextInput | null>>([]);
  const finishingRecallRef = useRef(false);

  const [mode, setMode] = useState<ArenaMnemonicMode>("digits");
  const [itemCount, setItemCount] = useState("8");
  const [memorizeSeconds, setMemorizeSeconds] = useState("60");
  const [recallSeconds, setRecallSeconds] = useState("240");
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState("");

  const [phase, setPhase] = useState<MnemonicPhase>("setup");
  const [items, setItems] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [enteredItems, setEnteredItems] = useState<string[]>([]);
  const [stageSeconds, setStageSeconds] = useState(PREPARE_SECONDS);
  const [elapsedMemorizeMs, setElapsedMemorizeMs] = useState(0);
  const [result, setResult] = useState<MnemonicResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<ArenaMnemonicLeaderboardEntry[]>([]);
  const [currentUserBest, setCurrentUserBest] = useState<ArenaMnemonicLeaderboardEntry | null>(
    null,
  );
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);

  const parsedAutoAdvance = useMemo(() => {
    if (!autoAdvanceSeconds.trim()) {
      return null;
    }

    const numeric = Number(autoAdvanceSeconds);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }

    return numeric;
  }, [autoAdvanceSeconds]);

  const normalizedLanguage = useMemo(getNormalizedLocaleLanguage, []);
  const currentItem = items[currentIndex] || "";
  const wordColumns = useMemo(() => chunkItems(items, 10), [items]);
  const recallColumns = useMemo(() => chunkItems(enteredItems, 10), [enteredItems]);
  const isModalOpen = dialogVisible;

  const headerTimerValue = useMemo(() => {
    if (
      phase === "prepare-memorize" ||
      phase === "memorize" ||
      phase === "prepare-recall" ||
      phase === "recall"
    ) {
      return formatCountdown(stageSeconds);
    }

    if (phase === "result" && result) {
      return formatMemorizeSeconds(result.elapsedMemorizeMs);
    }

    return null;
  }, [phase, result, stageSeconds]);

  const loadLeaderboard = useCallback(async (nextMode: ArenaMnemonicMode = mode) => {
    try {
      setLeaderboardLoading(true);
      const payload = await arenaApi.fetchMnemonicLeaderboard(nextMode);
      setLeaderboard(Array.isArray(payload?.leaderboard) ? payload.leaderboard : []);
      setCurrentUserBest(payload?.currentUserBest || null);
    } catch {
      setLeaderboard([]);
      setCurrentUserBest(null);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [mode]);

  const resetTrainingState = useCallback(() => {
    finishingRecallRef.current = false;
    setDialogVisible(false);
    setPhase("setup");
    setItems([]);
    setEnteredItems([]);
    setCurrentIndex(0);
    setStageSeconds(PREPARE_SECONDS);
    setElapsedMemorizeMs(0);
    setResult(null);
  }, []);

  const openSetupDialog = useCallback(() => {
    finishingRecallRef.current = false;
    setDialogVisible(true);
    setPhase("setup");
    setItems([]);
    setEnteredItems([]);
    setCurrentIndex(0);
    setStageSeconds(PREPARE_SECONDS);
    setElapsedMemorizeMs(0);
    setResult(null);
  }, []);

  const finishRecall = useCallback(() => {
    if (finishingRecallRef.current) {
      return;
    }

    finishingRecallRef.current = true;
    const score = items.reduce((total, item, index) => {
      if (mode === "words") {
        return total + (normalizeWord(enteredItems[index] || "") === normalizeWord(item) ? 1 : 0);
      }

      return total + ((enteredItems[index] || "") === item ? 1 : 0);
    }, 0);

    const nextResult = {
      score,
      total: items.length,
      expected: items,
      actual: enteredItems,
      elapsedMemorizeMs,
    };

    setResult(nextResult);
    setPhase("result");

    if (!currentUserId) {
      return;
    }

    void arenaApi
      .saveMnemonicBestResult({
        mode,
        score: nextResult.score,
        total: nextResult.total,
        elapsedMemorizeMs: nextResult.elapsedMemorizeMs,
      })
      .then((payload) => {
        if (payload?.currentUserBest) {
          setCurrentUserBest(payload.currentUserBest);
        }
        return loadLeaderboard(mode);
      })
      .catch(() => undefined);
  }, [currentUserId, elapsedMemorizeMs, enteredItems, items, loadLeaderboard, mode]);

  useEffect(() => {
    void loadLeaderboard(mode);
  }, [loadLeaderboard, mode]);

  useEffect(() => {
    if (
      phase !== "prepare-memorize" &&
      phase !== "memorize" &&
      phase !== "prepare-recall" &&
      phase !== "recall"
    ) {
      return undefined;
    }

    if (stageSeconds <= 0) {
      if (phase === "prepare-memorize") {
        setPhase("memorize");
        setStageSeconds(clamp(Number(memorizeSeconds) || 60, 5, 3600));
        return undefined;
      }

      if (phase === "memorize") {
        setPhase("prepare-recall");
        setCurrentIndex(0);
        setStageSeconds(PREPARE_SECONDS);
        return undefined;
      }

      if (phase === "prepare-recall") {
        setPhase("recall");
        setCurrentIndex(0);
        setStageSeconds(clamp(Number(recallSeconds) || 240, 5, 3600));
        return undefined;
      }

      finishRecall();
      return undefined;
    }

    const timer = setTimeout(() => {
      setStageSeconds((previous) => previous - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [finishRecall, memorizeSeconds, phase, recallSeconds, stageSeconds]);

  useEffect(() => {
    if (phase !== "memorize") {
      return undefined;
    }

    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedMemorizeMs(Date.now() - startedAt);
    }, 100);

    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "memorize" || !parsedAutoAdvance || items.length <= 1) {
      return undefined;
    }

    const perItemMs = Math.max(500, Math.round((parsedAutoAdvance * 1000) / items.length));
    const interval = setInterval(() => {
      setCurrentIndex((previous) => (previous + 1) % items.length);
    }, perItemMs);

    return () => clearInterval(interval);
  }, [items.length, parsedAutoAdvance, phase]);

  const handleBack = useCallback(() => {
    if (isModalOpen) {
      resetTrainingState();
      return;
    }

    if (Platform.OS === "web") {
      navigation.navigate("MainTabs", { screen: "Courses" });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("MainTabs", { screen: "Courses" });
  }, [isModalOpen, navigation, resetTrainingState]);

  const createTrainingItems = useCallback(
    (count: number) => {
      if (mode === "words") {
        return getMnemonicWords(normalizedLanguage, count);
      }

      return createDigits(count);
    },
    [mode, normalizedLanguage],
  );

  const startTraining = useCallback(() => {
    const safeCount = clamp(Number(itemCount) || 8, 1, MAX_ITEMS);
    const safeMemorize = clamp(Number(memorizeSeconds) || 60, 5, 3600);
    const safeRecall = clamp(Number(recallSeconds) || 240, 5, 3600);
    const nextItems = createTrainingItems(safeCount);

    finishingRecallRef.current = false;
    setItemCount(String(safeCount));
    setMemorizeSeconds(String(safeMemorize));
    setRecallSeconds(String(safeRecall));
    setItems(nextItems);
    setEnteredItems(Array.from({ length: safeCount }, () => ""));
    setCurrentIndex(0);
    setElapsedMemorizeMs(0);
    setResult(null);
    setStageSeconds(PREPARE_SECONDS);
    setPhase("prepare-memorize");
    setDialogVisible(true);
  }, [createTrainingItems, itemCount, memorizeSeconds, recallSeconds]);

  const finishMemorize = useCallback(() => {
    setPhase("prepare-recall");
    setCurrentIndex(0);
    setStageSeconds(PREPARE_SECONDS);
  }, []);

  const moveCurrentIndex = useCallback((direction: number) => {
    setCurrentIndex((previous) => clamp(previous + direction, 0, Math.max(items.length - 1, 0)));
  }, [items.length]);

  const clearCurrentItem = useCallback(() => {
    if (phase !== "recall") {
      return;
    }

    setEnteredItems((previous) => {
      const next = [...previous];
      next[currentIndex] = "";
      return next;
    });
  }, [currentIndex, phase]);

  const handleDigitInput = useCallback((digit: string) => {
    if (phase !== "recall" || mode !== "digits") {
      return;
    }

    setEnteredItems((previous) => {
      const next = [...previous];
      next[currentIndex] = String(digit);
      return next;
    });
    setCurrentIndex((previous) => Math.min(previous + 1, items.length - 1));
  }, [currentIndex, items.length, mode, phase]);

  const handleWordChange = useCallback((index: number, value: string) => {
    setEnteredItems((previous) => {
      const next = [...previous];
      next[index] = value;
      return next;
    });
    setCurrentIndex(index);
  }, []);

  const handleWordSubmitEditing = useCallback((index: number) => {
    const nextIndex = index + 1;
    if (nextIndex >= enteredItems.length) {
      return;
    }

    setCurrentIndex(nextIndex);
    wordInputRefs.current[nextIndex]?.focus();
  }, [enteredItems.length]);

  const skipToNextPhase = useCallback(() => {
    if (phase === "prepare-memorize") {
      setPhase("memorize");
      setStageSeconds(clamp(Number(memorizeSeconds) || 60, 5, 3600));
      return;
    }

    if (phase === "prepare-recall") {
      setPhase("recall");
      setCurrentIndex(0);
      setStageSeconds(clamp(Number(recallSeconds) || 240, 5, 3600));
    }
  }, [memorizeSeconds, phase, recallSeconds]);

  const showCurrentUserBest = Boolean(currentUserBest);

  const renderLeaderboardRow = (
    entry: ArenaMnemonicLeaderboardEntry,
    options?: {
      highlight?: boolean;
      note?: string;
      keyPrefix?: string;
    },
  ) => {
    const user = (entry.user || null) as any;
    const rowKey = `${options?.keyPrefix || "leaderboard"}-${entry.rank || 0}-${getEntityId(user) || "guest"}`;
    return (
      <View key={rowKey} style={[styles.leaderboardRow, options?.highlight && styles.leaderboardRowHighlight]}>
        <Text style={styles.leaderboardRank}>#{entry.rank || "-"}</Text>
        <View style={styles.leaderboardUserBlock}>
          <Avatar label={getLeaderboardUserLabel(entry)} uri={entry.user?.avatar} size={42} shape="circle" />
          <View style={styles.leaderboardNameWrap}>
            <UserDisplayName
              user={user}
              fallback={getLeaderboardUserLabel(entry)}
              size="sm"
              textStyle={styles.leaderboardName}
              containerStyle={styles.leaderboardNameContainer}
            />
            <Text style={styles.leaderboardMeta}>
              {options?.note || `${Math.round(Number(entry.accuracy || 0))}% aniqlik`}
            </Text>
          </View>
        </View>
        <View style={styles.leaderboardMetrics}>
          <Text style={styles.leaderboardMetricValue}>
            {entry.score || 0}/{entry.total || 0}
          </Text>
          <Text style={styles.leaderboardMetricValueMuted}>
            {formatMemorizeSeconds(Number(entry.elapsedMemorizeMs || 0))}
          </Text>
        </View>
      </View>
    );
  };

  const renderModeTabs = () => (
    <View style={styles.modeTabs}>
      <Pressable style={styles.modeTab} onPress={() => setMode("digits")}>
        <Text style={[styles.modeTabText, mode === "digits" && styles.modeTabTextActive]}>
          Raqamlar
        </Text>
        <View style={[styles.modeTabUnderline, mode === "digits" && styles.modeTabUnderlineActive]} />
      </Pressable>
      <Pressable style={styles.modeTab} onPress={() => setMode("words")}>
        <Text style={[styles.modeTabText, mode === "words" && styles.modeTabTextActive]}>
          So'zlar
        </Text>
        <View style={[styles.modeTabUnderline, mode === "words" && styles.modeTabUnderlineActive]} />
      </Pressable>
    </View>
  );

  const renderLeaderboard = () => (
    <View style={styles.leaderboardCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Leaderboard</Text>
        <Text style={styles.sectionHint}>Top natijalar</Text>
      </View>

      {showCurrentUserBest && currentUserBest ? renderLeaderboardRow(currentUserBest, {
        highlight: true,
        note: "Sizning eng yaxshi natijangiz",
        keyPrefix: "best",
      }) : null}

      {leaderboardLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : leaderboard.length ? (
        <View style={styles.leaderboardList}>
          {leaderboard.slice(0, 10).map((entry) =>
            renderLeaderboardRow(entry, {
              highlight:
                String(getEntityId(entry.user as any) || entry.user?._id || "") === currentUserId,
            }),
          )}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>Hali natijalar yo'q.</Text>
        </View>
      )}
    </View>
  );

  const renderOverview = () => (
    <ScrollView
      contentContainerStyle={[
        styles.overviewContent,
        { paddingBottom: Math.max(insets.bottom + 24, 28) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderMain}>
          <Pressable style={styles.pageBackButton} onPress={handleBack}>
            <ArrowLeft color={Colors.text} size={18} />
          </Pressable>
          <View style={styles.pageHeaderTextBlock}>
            <Text style={styles.pageTitle}>Mnemonics</Text>
            <Text style={styles.pageDescription}>Raqam va so'z yodlash mashqlari</Text>
          </View>
        </View>
        <Pressable style={styles.pagePlayButton} onPress={openSetupDialog}>
          <Play color="#fff" size={16} />
        </Pressable>
      </View>

      {renderModeTabs()}
      {renderLeaderboard()}
    </ScrollView>
  );

  const renderSetupPanel = () => (
    <View style={styles.setupCard}>
      {renderModeTabs()}
      <Text style={styles.setupTitle}>{mode === "digits" ? "Raqamlar mashqi" : "So'zlar mashqi"}</Text>
      <View style={styles.configGrid}>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>
            {mode === "digits" ? "Yodlanadigan raqamlar soni" : "Yodlanadigan so'zlar soni"}
          </Text>
          <TextInput
            value={itemCount}
            onChangeText={setItemCount}
            keyboardType="number-pad"
            style={styles.configInput}
            placeholder="8"
            placeholderTextColor={Colors.subtleText}
          />
        </View>

        <View style={styles.configRow}>
          <Text style={styles.configLabel}>Yodlash vaqti</Text>
          <TextInput
            value={memorizeSeconds}
            onChangeText={setMemorizeSeconds}
            keyboardType="number-pad"
            style={styles.configInput}
            placeholder="60"
            placeholderTextColor={Colors.subtleText}
          />
        </View>

        <View style={styles.configRow}>
          <Text style={styles.configLabel}>Qayta yozish vaqti</Text>
          <TextInput
            value={recallSeconds}
            onChangeText={setRecallSeconds}
            keyboardType="number-pad"
            style={styles.configInput}
            placeholder="240"
            placeholderTextColor={Colors.subtleText}
          />
        </View>

        <View style={styles.configRow}>
          <Text style={styles.configLabel}>Auto-advance umumiy vaqti</Text>
          <TextInput
            value={autoAdvanceSeconds}
            onChangeText={setAutoAdvanceSeconds}
            keyboardType="number-pad"
            style={styles.configInput}
            placeholder="Ixtiyoriy"
            placeholderTextColor={Colors.subtleText}
          />
        </View>
      </View>

      <Text style={styles.configHint}>
        {mode === "digits"
          ? `Bir mashqda ${MAX_ITEMS} tagacha raqam bilan ishlaysiz.`
          : `Bir mashqda ${MAX_ITEMS} tagacha so'z ishlatiladi. Lug'at bazasi: ${MNEMONIC_WORD_POOL_SIZE} ta.`}
      </Text>

      <View style={styles.configActions}>
        <Pressable style={styles.topActionButton} onPress={startTraining}>
          <Text style={styles.topActionButtonText}>Boshlash</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderDigitMemorize = () => (
    <View style={styles.trainingSection}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.digitGrid}>
        {items.map((item, index) => (
          <View
            key={`digit-memorize-${index}`}
            style={styles.digitStack}
          >
            <Text style={styles.digitIndex}>{index + 1}</Text>
            <View style={[styles.digitCell, index === currentIndex && styles.digitCellActive]}>
              <Text style={styles.digitCellText}>{item}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.numberStage}>
        <View style={styles.numberStageValueBox}>
          <Text style={styles.numberStageValue}>{currentItem || "-"}</Text>
        </View>
      </View>
    </View>
  );

  const renderWordsMemorize = () => (
    <View style={styles.wordStage}>
      {wordColumns.map((column, columnIndex) => (
        <View key={`word-column-${columnIndex}`} style={styles.wordPreviewColumn}>
          {column.map((word, itemIndex) => {
            const absoluteIndex = columnIndex * 10 + itemIndex;
            return (
              <View
                key={`word-preview-${absoluteIndex}`}
                style={[
                  styles.wordPreviewItem,
                  absoluteIndex === currentIndex && styles.wordPreviewItemActive,
                ]}
              >
                <Text style={styles.wordPreviewIndex}>{absoluteIndex + 1}</Text>
                <Text style={styles.wordPreviewText}>{word}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );

  const renderDigitRecall = () => (
    <View style={styles.trainingSection}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.digitGrid}>
        {items.map((_, index) => (
          <Pressable
            key={`digit-recall-${index}`}
            style={styles.digitStack}
            onPress={() => setCurrentIndex(index)}
          >
            <Text style={styles.digitIndex}>{index + 1}</Text>
            <View style={[styles.digitCell, index === currentIndex && styles.digitCellActive]}>
              <Text style={styles.digitCellTextMuted}>{enteredItems[index] || ""}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.keypad}>
        {Array.from({ length: 10 }, (_, index) => String(index)).map((digit) => (
          <Pressable key={digit} style={styles.keypadButton} onPress={() => handleDigitInput(digit)}>
            <Text style={styles.keypadButtonText}>{digit}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.keypadButton} onPress={() => moveCurrentIndex(-1)}>
          <ChevronLeft color="#fff" size={20} />
        </Pressable>
        <Pressable style={styles.keypadButton} onPress={() => moveCurrentIndex(1)}>
          <ChevronRight color="#fff" size={20} />
        </Pressable>
        <Pressable style={styles.keypadButton} onPress={clearCurrentItem}>
          <Text style={styles.keypadButtonLabel}>Tozalash</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderWordsRecall = () => (
    <View style={styles.wordInputGrid}>
        {recallColumns.map((column, columnIndex) => (
          <View key={`recall-column-${columnIndex}`} style={styles.wordPreviewColumn}>
            {column.map((value, itemIndex) => {
              const absoluteIndex = columnIndex * 10 + itemIndex;
              return (
                <View key={`word-input-${absoluteIndex}`} style={styles.wordInputRow}>
                  <Text style={styles.wordPreviewIndex}>{absoluteIndex + 1}</Text>
                  <TextInput
                    ref={(ref) => {
                      wordInputRefs.current[absoluteIndex] = ref;
                    }}
                    value={value}
                    onFocus={() => setCurrentIndex(absoluteIndex)}
                    onChangeText={(nextValue) => handleWordChange(absoluteIndex, nextValue)}
                    onSubmitEditing={() => handleWordSubmitEditing(absoluteIndex)}
                    returnKeyType={absoluteIndex >= enteredItems.length - 1 ? "done" : "next"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.wordInput,
                      absoluteIndex === currentIndex && styles.wordInputActive,
                    ]}
                    placeholder="So'zni kiriting"
                    placeholderTextColor={Colors.subtleText}
                  />
                </View>
              );
            })}
          </View>
        ))}
    </View>
  );

  const renderResult = () => (
    <View style={styles.resultPanel}>
      <View style={[styles.resultGrid, mode === "words" && styles.resultGridWide]}>
        {(result?.expected || []).map((expectedItem, index) => {
          const actualItem = result?.actual[index] || "";
          const isCorrect =
            mode === "words"
              ? normalizeWord(actualItem) === normalizeWord(expectedItem)
              : actualItem === expectedItem;

          return (
            <View
              key={`result-${index}`}
              style={[
                styles.resultCell,
                mode === "words" && styles.resultCellWide,
                !isCorrect && styles.resultCellWrong,
              ]}
            >
              <View style={styles.resultCellHalf}>
                <Text style={styles.resultCellHalfText}>{expectedItem}</Text>
              </View>
              <View
                style={[
                  styles.resultCellHalf,
                  isCorrect ? styles.resultCellHalfCorrect : styles.resultCellHalfWrong,
                ]}
              >
                <Text style={styles.resultCellHalfText}>{actualItem || ""}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  const renderStagePanel = () => (
    <View style={styles.stagePanel}>
      <View style={styles.trainingCanvas}>
        {phase === "prepare-memorize" || phase === "prepare-recall" ? (
          <View style={styles.prepareStage}>
            <Text style={styles.prepareNumber}>{stageSeconds}</Text>
            <Text style={styles.prepareHint}>{getPhaseSubtitle(phase, mode)}</Text>
          </View>
        ) : phase === "memorize" ? (
          mode === "digits" ? renderDigitMemorize() : renderWordsMemorize()
        ) : phase === "recall" ? (
          mode === "digits" ? renderDigitRecall() : renderWordsRecall()
        ) : (
          renderResult()
        )}
      </View>

      {phase === "memorize" ? (
        <View style={styles.keypad}>
          <Pressable
            style={[styles.keypadButton, currentIndex === 0 && styles.keypadButtonDisabled]}
            disabled={currentIndex === 0}
            onPress={() => moveCurrentIndex(-1)}
          >
            <ChevronLeft color="#fff" size={20} />
          </Pressable>
          <Pressable
            style={[
              styles.keypadButton,
              currentIndex === items.length - 1 && styles.keypadButtonDisabled,
            ]}
            disabled={currentIndex === items.length - 1}
            onPress={() => moveCurrentIndex(1)}
          >
            <ChevronRight color="#fff" size={20} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.configActions}>
        {phase === "prepare-memorize" || phase === "prepare-recall" ? (
          <Pressable style={styles.topActionButton} onPress={skipToNextPhase}>
            <Text style={styles.topActionButtonText}>O'tkazib yuborish</Text>
          </Pressable>
        ) : phase === "result" ? (
          <Pressable style={styles.topActionButton} onPress={resetTrainingState}>
            <Text style={styles.topActionButtonText}>Davom etish</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.finishedButton} onPress={phase === "recall" ? finishRecall : finishMemorize}>
            <Check color="#fff" size={16} />
            <Text style={styles.finishedButtonText}>Tugatdim</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {renderOverview()}

      <Modal
        visible={isModalOpen}
        animationType="fade"
        transparent
        onRequestClose={resetTrainingState}
      >
        <SafeAreaView style={styles.modalScreen} edges={["top", "left", "right", "bottom"]}>
          <Pressable style={styles.modalBackdrop} onPress={resetTrainingState} />
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View
              style={[
                styles.modalPanel,
                phase === "setup" ? styles.modalPanelSetup : styles.modalPanelStage,
              ]}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleBlock}>
                  <Text style={styles.modalTitle}>Mnemonics</Text>
                  {phase === "setup" ? (
                    <Text style={styles.modalSubtitle}>Raqam va so'z yodlash mashqi</Text>
                  ) : null}
                </View>
                <View style={styles.modalHeaderActions}>
                  {headerTimerValue ? (
                    <View style={styles.timerBadge}>
                      <Text style={styles.timerBadgeText}>{headerTimerValue}</Text>
                    </View>
                  ) : null}
                  <Pressable style={styles.modalCloseButton} onPress={resetTrainingState}>
                    <X color={Colors.text} size={18} />
                  </Pressable>
                </View>
              </View>

              <ScrollView
                contentContainerStyle={[
                  styles.modalScrollContent,
                  { paddingBottom: Math.max(insets.bottom + 20, 24) },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {phase === "setup" ? renderSetupPanel() : renderStagePanel()}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  overviewContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 14,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pageHeaderMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pageBackButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pageHeaderTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pageTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  pageDescription: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  pagePlayButton: {
    width: 35,
    height: 35,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  modeTabs: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modeTab: {
    position: "relative",
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  modeTabText: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "800",
  },
  modeTabTextActive: {
    color: Colors.text,
  },
  modeTabUnderline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    backgroundColor: "transparent",
  },
  modeTabUnderlineActive: {
    backgroundColor: Colors.primary,
  },
  leaderboardCard: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.surfaceMuted,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  sectionHint: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  centerState: {
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  leaderboardList: {
    gap: 8,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  leaderboardRowHighlight: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  leaderboardRank: {
    width: 32,
    color: Colors.mutedText,
    fontSize: 13,
    fontWeight: "800",
  },
  leaderboardUserBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leaderboardNameWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  leaderboardNameContainer: {
    gap: 4,
  },
  leaderboardName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  leaderboardMeta: {
    color: Colors.mutedText,
    fontSize: 11,
  },
  leaderboardMetrics: {
    alignItems: "flex-end",
    gap: 3,
  },
  leaderboardMetricValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  leaderboardMetricValueMuted: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  emptyCard: {
    paddingVertical: 14,
  },
  emptyCardText: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  setupCard: {
    gap: 18,
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    backgroundColor: Colors.surface,
  },
  setupTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  configGrid: {
    gap: 16,
  },
  configRow: {
    gap: 8,
  },
  configLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  configInput: {
    width: "100%",
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.input,
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  configHint: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  configActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  topActionButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  topActionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  stagePanel: {
    gap: 16,
  },
  trainingCanvas: {
    gap: 24,
    minHeight: 420,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(220, 221, 222, 0.28)",
    backgroundColor: "rgba(47, 49, 54, 0.8)",
  },
  trainingSection: {
    gap: 20,
  },
  prepareStage: {
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  prepareNumber: {
    color: Colors.text,
    fontSize: 72,
    fontWeight: "900",
    lineHeight: 80,
  },
  prepareHint: {
    color: Colors.mutedText,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  digitGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 0,
    paddingRight: 12,
  },
  digitStack: {
    marginRight: 8,
    alignItems: "center",
  },
  digitIndex: {
    minWidth: 28,
    marginBottom: 8,
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  digitCell: {
    width: 52,
    height: 52,
    borderWidth: 1,
    borderColor: "rgba(220, 221, 222, 0.35)",
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  digitCellActive: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  digitCellText: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "500",
  },
  digitCellTextMuted: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "500",
  },
  numberStage: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 150,
  },
  numberStageValueBox: {
    minWidth: "100%",
    minHeight: 100,
    paddingHorizontal: 28,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  numberStageValue: {
    color: Colors.text,
    fontSize: 40,
    fontWeight: "500",
    textAlign: "center",
  },
  wordStage: {
    gap: 16,
  },
  wordPreviewColumn: {
    gap: 12,
  },
  wordPreviewItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 34,
  },
  wordPreviewItemActive: {},
  wordPreviewIndex: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.mutedText,
  },
  wordPreviewText: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Colors.background,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 34,
    overflow: "hidden",
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  keypadButton: {
    minWidth: 58,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  keypadButtonDisabled: {
    opacity: 0.45,
  },
  keypadButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  keypadButtonLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  wordInputGrid: {
    gap: 12,
  },
  wordInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  wordInput: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.background,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  wordInputActive: {
    borderColor: Colors.warning,
    backgroundColor: "rgba(250, 166, 26, 0.2)",
  },
  resultPanel: {
    gap: 20,
  },
  resultGrid: {
    gap: 10,
  },
  resultGridWide: {
    gap: 10,
  },
  resultCell: {
    borderWidth: 1,
    borderColor: "rgba(220, 221, 222, 0.35)",
    overflow: "hidden",
  },
  resultCellWide: {
    flexDirection: "row",
  },
  resultCellWrong: {
    borderColor: "rgba(240, 71, 71, 0.38)",
  },
  resultCellHalf: {
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  resultCellHalfCorrect: {
    backgroundColor: "rgba(67, 181, 129, 0.85)",
  },
  resultCellHalfWrong: {
    backgroundColor: "rgba(240, 71, 71, 0.8)",
  },
  resultCellHalfText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "500",
    textAlign: "center",
  },
  finishedButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  finishedButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  modalScreen: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.48)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalKeyboard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  modalPanel: {
    width: "100%",
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  modalPanelSetup: {
    maxWidth: 760,
  },
  modalPanelStage: {
    maxWidth: 1120,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitleBlock: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  modalSubtitle: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  modalHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timerBadge: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timerBadgeText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalScrollContent: {
    padding: 16,
  },
});
