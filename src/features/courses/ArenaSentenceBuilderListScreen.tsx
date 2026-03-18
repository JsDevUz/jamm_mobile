import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Eye,
  Link2,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Timer,
  Trash2,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { APP_LIMITS, getTierLimit } from "../../constants/appLimits";
import { arenaApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type {
  ArenaSentenceBuilderCheckResult,
  ArenaSentenceBuilderDeck,
  ArenaSentenceBuilderDecksResponse,
  ArenaSentenceBuilderQuestion,
  ArenaSentenceBuilderSubmitResult,
} from "../../types/arena";
import { getEntityId } from "../../utils/chat";
import { ArenaSentenceBuilderEditorSheet } from "./ArenaSentenceBuilderEditorSheet";
import { ArenaSentenceBuilderResultsSheet } from "./ArenaSentenceBuilderResultsSheet";
import { ArenaSentenceBuilderShareLinksSheet } from "./ArenaSentenceBuilderShareLinksSheet";
import {
  buildSentenceBuilderOptionTokens,
  canManageSentenceBuilderDeck,
  getSentenceBuilderCreatorName,
  getSentenceBuilderDeckId,
  type SentenceBuilderToken,
} from "./ArenaSentenceBuilderUtils";

type Props = NativeStackScreenProps<RootStackParamList, "ArenaSentenceBuilderList">;
type MenuState = {
  deck: ArenaSentenceBuilderDeck;
  x: number;
  y: number;
  width: number;
  height: number;
};

type SessionResultItem = {
  prompt: string;
  isCorrect?: boolean;
  expectedTokens?: string[];
  selectedTokens?: string[];
  mistakes?: Array<{ position?: number; expected?: string; actual?: string }>;
};

const FLOATING_MENU_WIDTH = 196;
const FLOATING_MENU_HEIGHT = 212;

function formatTimer(totalSeconds: number) {
  const safeValue = Math.max(0, totalSeconds);
  return `${Math.floor(safeValue / 60)}:${String(safeValue % 60).padStart(2, "0")}`;
}

export function ArenaSentenceBuilderListScreen({ navigation, route }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const user = useAuthStore((state) => state.user);
  const currentUserId = String(user?._id || user?.id || "");
  const deckLimit = getTierLimit(APP_LIMITS.sentenceBuildersCreated, user?.premiumStatus);
  const menuButtonRefs = useRef<Record<string, View | null>>({});
  const [decks, setDecks] = useState<ArenaSentenceBuilderDeck[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingDeck, setEditingDeck] = useState<ArenaSentenceBuilderDeck | null>(null);
  const [viewingDeck, setViewingDeck] = useState<ArenaSentenceBuilderDeck | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);
  const [practicingDeck, setPracticingDeck] = useState<ArenaSentenceBuilderDeck | null>(null);
  const [activeShareShortCode, setActiveShareShortCode] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [poolTokens, setPoolTokens] = useState<SentenceBuilderToken[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<SentenceBuilderToken[]>([]);
  const [checkedResult, setCheckedResult] = useState<ArenaSentenceBuilderCheckResult | null>(null);
  const [answerMap, setAnswerMap] = useState<Record<number, string[]>>({});
  const [sessionResults, setSessionResults] = useState<SessionResultItem[]>([]);
  const [attemptSummary, setAttemptSummary] = useState<ArenaSentenceBuilderSubmitResult | null>(
    null,
  );
  const [sessionComplete, setSessionComplete] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submittingAttempt, setSubmittingAttempt] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [shareDeck, setShareDeck] = useState<ArenaSentenceBuilderDeck | null>(null);
  const [resultsDeck, setResultsDeck] = useState<ArenaSentenceBuilderDeck | null>(null);
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);

  const myDeckCount = useMemo(
    () =>
      decks.filter((deck) => String(getEntityId(deck.createdBy as any) || "") === currentUserId)
        .length,
    [currentUserId, decks],
  );

  const mergeDecks = useCallback(
    (current: ArenaSentenceBuilderDeck[], incoming: ArenaSentenceBuilderDeck[]) => {
      const nextMap = new Map<string, ArenaSentenceBuilderDeck>();
      [...current, ...incoming].forEach((deck, index) => {
        const key = String(deck._id || deck.urlSlug || `sentence-builder-${index}`);
        nextMap.set(key, deck);
      });
      return Array.from(nextMap.values());
    },
    [],
  );

  const loadDecks = useCallback(
    async (
      nextPage = 1,
      options?: {
        replace?: boolean;
        silent?: boolean;
      },
    ) => {
      const replace = options?.replace === true;
      const silent = options?.silent === true;

      if (!silent) {
        if (replace && decks.length > 0) {
          setRefreshing(true);
        } else if (replace) {
          setInitialLoading(true);
        } else {
          setLoadingMore(true);
        }
      }

      try {
        const payload = (await arenaApi.fetchSentenceBuilders(
          nextPage,
          APP_LIMITS.sentenceBuilderPageSize,
        )) as ArenaSentenceBuilderDecksResponse;
        const items = Array.isArray(payload.data) ? payload.data : [];

        setDecks((previous) => (replace ? items : mergeDecks(previous, items)));
        setPage(Number(payload.page || nextPage));
        setHasMore(Number(payload.page || nextPage) < Number(payload.totalPages || 1));
      } catch (error) {
        if (!silent) {
          Alert.alert(
            "Gap tuzish yuklanmadi",
            error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
          );
        }
      } finally {
        if (!silent) {
          setInitialLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [decks.length, mergeDecks],
  );

  const loadDeckById = useCallback(
    async (deckId: string, shareShortCode?: string | null): Promise<ArenaSentenceBuilderDeck | null> => {
      if (shareShortCode) {
        const shared = await arenaApi.fetchSharedSentenceBuilderDeck(shareShortCode);
        setActiveShareShortCode(shared.shareLink?.shortCode || shareShortCode);
        return shared.deck || null;
      }

      const payload = await arenaApi.fetchSentenceBuilderDeck(deckId);
      if (payload && typeof payload === "object" && "deck" in payload) {
        return payload.deck || null;
      }
      return (payload as ArenaSentenceBuilderDeck | null) || null;
    },
    [],
  );

  useEffect(() => {
    void loadDecks(1, { replace: true });

    const unsubscribe = navigation.addListener("focus", () => {
      void loadDecks(1, { replace: true, silent: false });
    });

    return unsubscribe;
  }, [loadDecks, navigation]);

  useEffect(() => {
    const initialDeckId = String(route.params?.deckId || "");
    const sharedCode = String(route.params?.shareShortCode || "");
    const deckSeed = route.params?.deck;
    if (!initialDeckId && !sharedCode) {
      return;
    }

    let active = true;
    void (async () => {
      try {
        if (deckSeed && active) {
          setViewingDeck(deckSeed);
          return;
        }

        const deck = await loadDeckById(initialDeckId || sharedCode, sharedCode || null);
        if (active) {
          setViewingDeck(deck);
        }
      } catch (error) {
        if (active) {
          Alert.alert(
            "To'plam ochilmadi",
            error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
          );
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [loadDeckById, route.params?.deck, route.params?.deckId, route.params?.shareShortCode]);

  const handleBack = useCallback(() => {
    if (practicingDeck) {
      setViewingDeck(practicingDeck);
      setPracticingDeck(null);
      setSessionComplete(false);
      setAttemptSummary(null);
      setSessionResults([]);
      setActiveShareShortCode(null);
      return;
    }

    if (viewingDeck) {
      setViewingDeck(null);
      setActiveShareShortCode(null);
      return;
    }

    navigation.navigate("MainTabs", {
      screen: "Courses",
      params: { viewMode: "arena" },
    });
  }, [navigation, practicingDeck, viewingDeck]);

  const openMenu = (deck: ArenaSentenceBuilderDeck) => {
    const deckId = getSentenceBuilderDeckId(deck);
    if (!deckId) {
      return;
    }

    if (menuState?.deck._id === deck._id) {
      setMenuState(null);
      return;
    }

    const target = menuButtonRefs.current[deckId];
    if (!target) {
      setMenuState({
        deck,
        x: screenWidth - FLOATING_MENU_WIDTH - 12,
        y: 96,
        width: 34,
        height: 34,
      });
      return;
    }

    target.measureInWindow((x, y, width, height) => {
      setMenuState({
        deck,
        x,
        y,
        width,
        height,
      });
    });
  };

  const handleOpenCreate = () => {
    if (myDeckCount >= deckLimit) {
      Alert.alert(
        "Limitga yetildi",
        `Siz maksimal ${deckLimit} ta sentence builder to'plami yarata olasiz.`,
      );
      return;
    }

    setEditingDeck(null);
    setEditorVisible(true);
  };

  const handleViewDeck = async (deckId: string, shareShortCode?: string | null) => {
    setViewingLoading(true);
    try {
      const deck = await loadDeckById(deckId, shareShortCode || null);
      setViewingDeck(deck);
      setPracticingDeck(null);
      setSessionComplete(false);
    } catch (error) {
      Alert.alert(
        "To'plam ochilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setViewingLoading(false);
    }
  };

  const resetPracticeState = useCallback((deck: ArenaSentenceBuilderDeck | null) => {
    setQuestionIndex(0);
    setSelectedTokens([]);
    setPoolTokens(buildSentenceBuilderOptionTokens(deck?.items?.[0] || null));
    setCheckedResult(null);
    setAnswerMap({});
    setSessionResults([]);
    setSessionComplete(false);
    setAttemptSummary(null);
    setTimeLeft(Math.max(0, Number(deck?.timeLimit || 0) * 60));
  }, []);

  const handleStartPractice = async (
    deckOrId: ArenaSentenceBuilderDeck | string,
    shareShortCode?: string | null,
  ) => {
    try {
      const deck =
        typeof deckOrId === "string"
          ? await loadDeckById(deckOrId, shareShortCode || null)
          : deckOrId;

      if (!deck?.items?.length) {
        Alert.alert("Savollar topilmadi", "Bu to'plamda savollar topilmadi.");
        return;
      }

      setViewingDeck(null);
      setPracticingDeck(deck);
      setActiveShareShortCode(shareShortCode || null);
      resetPracticeState(deck);
    } catch (error) {
      Alert.alert(
        "Mashq ochilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    }
  };

  const currentQuestion = practicingDeck?.items?.[questionIndex] || null;

  useEffect(() => {
    if (!currentQuestion || sessionComplete) {
      return;
    }

    const storedTokens = answerMap[questionIndex] || [];
    const nextPool = buildSentenceBuilderOptionTokens(currentQuestion).filter(
      (token) => !storedTokens.includes(token.text),
    );
    setSelectedTokens(
      storedTokens.map((token, index) => ({
        id: `selected-${questionIndex}-${index}-${token}`,
        text: token,
      })),
    );
    setPoolTokens(nextPool);
    setCheckedResult(null);
  }, [currentQuestion, questionIndex, sessionComplete]);

  useEffect(() => {
    if (!practicingDeck || sessionComplete || submittingAttempt || !timeLeft) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [practicingDeck, sessionComplete, submittingAttempt, timeLeft]);

  const finishPractice = useCallback(
    async (overrideAnswers?: Record<number, string[]>, overrideResults?: SessionResultItem[]) => {
      if (!practicingDeck?._id || submittingAttempt) {
        return;
      }

      setSubmittingAttempt(true);
      try {
        const mergedAnswerMap = {
          ...answerMap,
          ...(overrideAnswers || {}),
        };

        const answers = Object.entries(mergedAnswerMap).map(([idx, tokens]) => ({
          questionIndex: Number(idx),
          selectedTokens: tokens,
        }));

        const result = await arenaApi.submitSentenceBuilderAttempt(String(practicingDeck._id), {
          answers,
          guestName: null,
          shareShortCode: activeShareShortCode || null,
        });

        setAttemptSummary(result);
        setSessionResults(
          Array.isArray(result.items) && result.items.length
            ? result.items.map((item) => ({
                prompt:
                  item.prompt ||
                  practicingDeck.items?.[item.questionIndex || 0]?.prompt ||
                  `Savol #${(item.questionIndex || 0) + 1}`,
                isCorrect: item.isCorrect,
                expectedTokens: item.expectedTokens,
                selectedTokens: item.selectedTokens,
                mistakes: item.mistakes,
              }))
            : overrideResults || [],
        );
        setSessionComplete(true);
      } catch (error) {
        Alert.alert(
          "Natija saqlanmadi",
          error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
        );
      } finally {
        setSubmittingAttempt(false);
      }
    },
    [activeShareShortCode, answerMap, practicingDeck, submittingAttempt],
  );

  useEffect(() => {
    if (
      !practicingDeck ||
      Number(practicingDeck.timeLimit || 0) <= 0 ||
      timeLeft > 0 ||
      sessionComplete ||
      submittingAttempt
    ) {
      return;
    }

    void finishPractice(answerMap, sessionResults);
  }, [answerMap, finishPractice, practicingDeck, sessionComplete, sessionResults, submittingAttempt, timeLeft]);

  const handleChooseToken = (token: SentenceBuilderToken) => {
    if (checkedResult) {
      return;
    }

    setPoolTokens((previous) => previous.filter((item) => item.id !== token.id));
    setSelectedTokens((previous) => [...previous, token]);
  };

  const handleRemoveToken = (token: SentenceBuilderToken) => {
    if (checkedResult) {
      return;
    }

    setSelectedTokens((previous) => previous.filter((item) => item.id !== token.id));
    setPoolTokens((previous) => [...previous, token]);
  };

  const handleCheck = async () => {
    if (!practicingDeck?._id || !currentQuestion || !selectedTokens.length) {
      Alert.alert("Javob kerak", "Avval bo'laklardan gap tuzing.");
      return;
    }

    setChecking(true);
    try {
      const result = await arenaApi.checkSentenceBuilderAnswer(
        String(practicingDeck._id),
        questionIndex,
        selectedTokens.map((token) => token.text),
      );
      setCheckedResult(result);
      setAnswerMap((previous) => ({
        ...previous,
        [questionIndex]: selectedTokens.map((token) => token.text),
      }));
    } catch (error) {
      Alert.alert(
        "Tekshirilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setChecking(false);
    }
  };

  const handleNext = async () => {
    if (!checkedResult || !currentQuestion) {
      return;
    }

    const nextResults = [
      ...sessionResults,
      {
        prompt: String(currentQuestion.prompt || `Savol #${questionIndex + 1}`),
        isCorrect: checkedResult.isCorrect,
        expectedTokens:
          checkedResult.expectedTokens || checkedResult.expected || (currentQuestion.answerTokens || []),
        selectedTokens: selectedTokens.map((token) => token.text),
        mistakes: checkedResult.mistakes,
      },
    ];

    setSessionResults(nextResults);

    if (questionIndex >= (practicingDeck?.items?.length || 0) - 1) {
      await finishPractice(
        {
          ...answerMap,
          [questionIndex]: selectedTokens.map((token) => token.text),
        },
        nextResults,
      );
      return;
    }

    setQuestionIndex((previous) => previous + 1);
  };

  const handleRestart = () => {
    if (!practicingDeck) {
      return;
    }

    resetPracticeState(practicingDeck);
  };

  const handleDeleteDeck = (deck: ArenaSentenceBuilderDeck) => {
    const deckId = getSentenceBuilderDeckId(deck);
    if (!deckId || deletingDeckId) {
      return;
    }

    Alert.alert(
      "To'plamni o'chirasizmi?",
      "Bu amalni ortga qaytarib bo'lmaydi.",
      [
        { text: "Bekor qilish", style: "cancel" },
        {
          text: "O'chirish",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingDeckId(deckId);
              try {
                await arenaApi.deleteSentenceBuilderDeck(deckId);
                setMenuState(null);
                if (viewingDeck?._id === deck._id) {
                  setViewingDeck(null);
                }
                if (practicingDeck?._id === deck._id) {
                  setPracticingDeck(null);
                }
                await loadDecks(1, { replace: true, silent: true });
              } catch (error) {
                Alert.alert(
                  "To'plam o'chirilmadi",
                  error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
                );
              } finally {
                setDeletingDeckId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const handleSavedEditor = async () => {
    await loadDecks(1, { replace: true, silent: true });
  };

  const handleLoadMore = () => {
    if (!hasMore || loadingMore || initialLoading) {
      return;
    }

    void loadDecks(page + 1);
  };

  const activeMenuDeck = menuState?.deck || null;
  const activeMenuCanManage = canManageSentenceBuilderDeck(activeMenuDeck, currentUserId);
  const canViewAnswers = viewingDeck?.canViewAnswers !== false;
  const progressWidth = useMemo(() => {
    if (!practicingDeck?.items?.length) {
      return "0%";
    }

    return `${((questionIndex + 1) / practicingDeck.items.length) * 100}%`;
  }, [practicingDeck?.items?.length, questionIndex]);
  const summaryAccuracy = Number(
    attemptSummary?.accuracy ?? attemptSummary?.percent ?? 0,
  );

  const menuLeft = useMemo(() => {
    if (!menuState) {
      return 12;
    }

    const preferredLeft = menuState.x + menuState.width - FLOATING_MENU_WIDTH;
    return Math.max(12, Math.min(preferredLeft, screenWidth - FLOATING_MENU_WIDTH - 12));
  }, [menuState, screenWidth]);

  const menuTop = useMemo(() => {
    if (!menuState) {
      return 12;
    }

    const belowTop = menuState.y + menuState.height + 8;
    if (belowTop + FLOATING_MENU_HEIGHT <= screenHeight - 12) {
      return belowTop;
    }

    return Math.max(12, menuState.y - FLOATING_MENU_HEIGHT - 8);
  }, [menuState, screenHeight]);

  const renderDeckCard = ({ item }: { item: ArenaSentenceBuilderDeck }) => {
    const deckId = getSentenceBuilderDeckId(item);
    const canManage = canManageSentenceBuilderDeck(item, currentUserId);
    const creator = getSentenceBuilderCreatorName(item);
    const questionsCount = item.items?.length || 0;
    const deleting = deletingDeckId === deckId;

    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          if (menuState?.deck._id === item._id) {
            setMenuState(null);
            return;
          }

          void handleStartPractice(item);
        }}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTitleColumn}>
            <Text style={styles.cardTitle}>{item.title?.trim() || "Nomsiz to'plam"}</Text>
          </View>

          <View
            ref={(node) => {
              menuButtonRefs.current[deckId] = node;
            }}
            collapsable={false}
          >
            <Pressable
              style={styles.menuButton}
              onPress={(event) => {
                event.stopPropagation();
                openMenu(item);
              }}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <MoreHorizontal size={18} color={Colors.text} />
              )}
            </Pressable>
          </View>
        </View>

        <Text style={styles.cardDescription} numberOfLines={3}>
          {item.description?.trim() || "Tavsif yo'q"}
        </Text>
        <Text style={styles.cardMeta}>Savollar: {questionsCount}</Text>
        <Text style={styles.cardMeta}>Tuzuvchi: {creator}</Text>
        <View style={styles.cardHint}>
          <PlayCircle size={14} color={Colors.mutedText} />
          <Text style={styles.cardHintText}>Boshlash uchun kartani bosing</Text>
        </View>
      </Pressable>
    );
  };

  if (sessionComplete && practicingDeck) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable style={styles.headerButton} onPress={handleBack}>
              <ArrowLeft size={20} color={Colors.text} />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {practicingDeck.title?.trim() || "Gap tuzish"}
            </Text>
            <View style={styles.headerButtonPlaceholder} />
          </View>

          <ScrollView contentContainerStyle={styles.practiceContent} showsVerticalScrollIndicator={false}>
            <View style={styles.summaryHero}>
              <Text style={styles.summaryHeroValue}>
                {Number(attemptSummary?.score || sessionResults.filter((item) => item.isCorrect).length)}
              </Text>
              <Text style={styles.summaryHeroLabel}>To'g'ri gaplar</Text>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Jami savollar</Text>
                <Text style={styles.summaryCardValue}>
                  {Number(attemptSummary?.total || sessionResults.length)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Aniqlik</Text>
                <Text style={styles.summaryCardValue}>{summaryAccuracy}%</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Holat</Text>
                <Text style={styles.summaryCardValue}>
                  {attemptSummary?.passed === false ? "Retry" : "Passed"}
                </Text>
              </View>
            </View>

            {attemptSummary?.showResults !== false ? (
              <View style={styles.resultList}>
                {sessionResults.map((result, index) => (
                  <View key={`${result.prompt}-${index}`} style={styles.resultCard}>
                    <Text style={styles.resultCardTitle}>
                      Savol #{index + 1}: {result.prompt}
                    </Text>
                    <Text
                      style={[
                        styles.resultCardState,
                        result.isCorrect ? styles.resultCardStateCorrect : styles.resultCardStateWrong,
                      ]}
                    >
                      {result.isCorrect ? "To'g'ri" : "Noto'g'ri"}
                    </Text>
                    <View style={styles.tokenWrap}>
                      {(result.expectedTokens || []).map((token, tokenIndex) => (
                        <View key={`${token}-${tokenIndex}`} style={[styles.tokenChip, styles.tokenChipExpected]}>
                          <Text style={styles.tokenText}>{token}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>
                Bu havola uchun natija breakdowni ko'rsatilmaydi.
              </Text>
            )}

            <View style={styles.footerActionRow}>
              <Pressable style={styles.primaryButton} onPress={handleRestart}>
                <RefreshCw size={16} color="#fff" />
                <Text style={styles.primaryButtonText}>Qayta boshlash</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={handleBack}>
                <Text style={styles.secondaryButtonText}>Orqaga</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  if (practicingDeck && currentQuestion) {
    const canShowFeedback = checkedResult && practicingDeck.showResults !== false;
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable style={styles.headerButton} onPress={handleBack}>
              <ArrowLeft size={20} color={Colors.text} />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {practicingDeck.title?.trim() || "Gap tuzish"}
            </Text>
            <View style={styles.headerMetaPill}>
              <Text style={styles.headerMetaPillText}>
                {Number(practicingDeck.timeLimit || 0) > 0
                  ? formatTimer(timeLeft)
                  : `${practicingDeck.items?.length || 0} gap`}
              </Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.practiceContent} showsVerticalScrollIndicator={false}>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                Savol {questionIndex + 1} / {practicingDeck.items?.length || 0}
              </Text>
              <View style={styles.metaTimerWrap}>
                {Number(practicingDeck.timeLimit || 0) > 0 ? (
                  <>
                    <Timer size={14} color={Colors.mutedText} />
                    <Text style={styles.metaText}>{formatTimer(timeLeft)}</Text>
                  </>
                ) : null}
              </View>
            </View>

            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: progressWidth as any }]} />
            </View>

            <View style={styles.practiceCard}>
              <Text style={styles.sectionLabel}>Savol</Text>
              <Text style={styles.promptText}>
                {currentQuestion.prompt || "Gapni tuzing"}
              </Text>

              <Text style={styles.sectionLabel}>Sizning gapingiz</Text>
              <View style={styles.dropZone}>
                {selectedTokens.length ? (
                  selectedTokens.map((token, index) => {
                    const state = checkedResult
                      ? token.text ===
                        (checkedResult.expectedTokens || checkedResult.expected || [])[index]
                        ? "correct"
                        : "wrong"
                      : null;

                    return (
                      <Pressable
                        key={token.id}
                        style={[
                          styles.tokenButton,
                          styles.tokenButtonSelected,
                          state === "correct" && styles.tokenButtonCorrect,
                          state === "wrong" && styles.tokenButtonWrong,
                        ]}
                        disabled={Boolean(checkedResult)}
                        onPress={() => handleRemoveToken(token)}
                      >
                        <Text style={styles.tokenText}>{token.text}</Text>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.dropZoneHint}>Bo'laklarni bosib gap tuzing</Text>
                )}
              </View>

              <Text style={styles.sectionLabel}>Bo'laklar</Text>
              <View style={styles.tokenWrap}>
                {poolTokens.map((token) => (
                  <Pressable
                    key={token.id}
                    style={styles.tokenButton}
                    disabled={Boolean(checkedResult)}
                    onPress={() => handleChooseToken(token)}
                  >
                    <Text style={styles.tokenText}>{token.text}</Text>
                  </Pressable>
                ))}
              </View>

              {canShowFeedback ? (
                <View
                  style={[
                    styles.feedbackCard,
                    checkedResult?.isCorrect ? styles.feedbackCardCorrect : styles.feedbackCardWrong,
                  ]}
                >
                  <View style={styles.feedbackTitleRow}>
                    {checkedResult?.isCorrect ? (
                      <CheckCircle size={18} color="#16a34a" />
                    ) : (
                      <AlertTriangle size={18} color={Colors.danger} />
                    )}
                    <Text style={styles.feedbackTitle}>
                      {checkedResult?.isCorrect ? "Javob to'g'ri" : "Javobda xato bor"}
                    </Text>
                  </View>

                  <Text style={styles.sectionHint}>To'g'ri javob bo'laklari</Text>
                  <View style={styles.tokenWrap}>
                    {(checkedResult?.expectedTokens || checkedResult?.expected || []).map(
                      (token, index) => (
                        <View key={`${token}-${index}`} style={[styles.tokenChip, styles.tokenChipExpected]}>
                          <Text style={styles.tokenText}>{token}</Text>
                        </View>
                      ),
                    )}
                  </View>

                  {!checkedResult?.isCorrect && checkedResult?.mistakes?.length ? (
                    <View style={styles.mistakesWrap}>
                      {checkedResult.mistakes.map((mistake, index) => (
                        <Text key={`${mistake.position}-${index}`} style={styles.mistakeText}>
                          {mistake.position}-bo'lakda siz{" "}
                          <Text style={styles.mistakeStrong}>
                            {mistake.actual || "hech narsa"}
                          </Text>{" "}
                          tanladingiz. To'g'risi:{" "}
                          <Text style={styles.mistakeStrong}>
                            {mistake.expected || "ortiqcha bo'lak"}
                          </Text>
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.practiceFooter}>
            {!checkedResult ? (
              <Pressable
                style={[
                  styles.primaryButton,
                  (!selectedTokens.length || checking) && styles.buttonDisabled,
                ]}
                onPress={() => void handleCheck()}
                disabled={!selectedTokens.length || checking}
              >
                {checking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Tekshirish</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={[styles.primaryButton, submittingAttempt && styles.buttonDisabled]}
                onPress={() => void handleNext()}
                disabled={submittingAttempt}
              >
                {submittingAttempt ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {questionIndex >= (practicingDeck.items?.length || 0) - 1
                      ? "Yakunlash"
                      : "Keyingi savol"}
                  </Text>
                )}
              </Pressable>
            )}
            {questionIndex >= (practicingDeck.items?.length || 0) - 1 ? (
              <Pressable
                style={[styles.secondaryButton, submittingAttempt && styles.buttonDisabled]}
                onPress={() => void finishPractice(answerMap, sessionResults)}
                disabled={submittingAttempt}
              >
                <Text style={styles.secondaryButtonText}>Erta yakunlash</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (viewingDeck || viewingLoading) {
    const activeDeck = viewingDeck;
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable style={styles.headerButton} onPress={handleBack}>
              <ArrowLeft size={20} color={Colors.text} />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {activeDeck?.title?.trim() || "Gap tuzish"}
            </Text>
            <View style={styles.headerButtonPlaceholder} />
          </View>

          {viewingLoading && !activeDeck ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : activeDeck ? (
            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              <View style={styles.detailHero}>
                <Text style={styles.detailTitle}>{activeDeck.title?.trim() || "Nomsiz to'plam"}</Text>
                <Text style={styles.detailDescription}>
                  {activeDeck.description?.trim() || "Tavsif kiritilmagan"}
                </Text>
                <Text style={styles.detailMeta}>
                  Savollar soni: {activeDeck.items?.length || 0}
                </Text>
              </View>

              <View style={styles.footerActionRow}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => void handleStartPractice(activeDeck, activeShareShortCode)}
                >
                  <PlayCircle size={16} color="#fff" />
                  <Text style={styles.primaryButtonText}>Mashq qilish</Text>
                </Pressable>
                {activeDeck.canViewAnswers !== false ? (
                  <>
                    <Pressable style={styles.secondaryButton} onPress={() => setShareDeck(activeDeck)}>
                      <Link2 size={16} color={Colors.text} />
                      <Text style={styles.secondaryButtonText}>Havolalar</Text>
                    </Pressable>
                    <Pressable style={styles.secondaryButton} onPress={() => setResultsDeck(activeDeck)}>
                      <BarChart3 size={16} color={Colors.text} />
                      <Text style={styles.secondaryButtonText}>Natijalar</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>

              <View style={styles.questionList}>
                {(activeDeck.items || []).map((item, index) => (
                  <View key={String(item._id || index)} style={styles.questionCard}>
                    <Text style={styles.questionTitle}>Savol #{index + 1}</Text>
                    <Text style={styles.questionPrompt}>{item.prompt || "Savol yo'q"}</Text>

                    {activeDeck.canViewAnswers !== false ? (
                      <>
                        <Text style={styles.sectionHint}>To'g'ri bo'laklar</Text>
                        <View style={styles.tokenWrap}>
                          {(item.answerTokens || []).map((token, tokenIndex) => (
                            <View key={`${token}-${tokenIndex}`} style={[styles.tokenChip, styles.tokenChipAnswerPreview]}>
                              <Text style={styles.tokenText}>{token}</Text>
                            </View>
                          ))}
                        </View>

                        {(item.extraTokens || []).length > 0 ? (
                          <>
                            <Text style={styles.sectionHint}>Chalg'ituvchi bo'laklar</Text>
                            <View style={styles.tokenWrap}>
                              {(item.extraTokens || []).map((token, tokenIndex) => (
                                <View key={`${token}-${tokenIndex}`} style={[styles.tokenChip, styles.tokenChipExtraPreview]}>
                                  <Text style={styles.tokenText}>{token}</Text>
                                </View>
                              ))}
                            </View>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <Text style={styles.sectionHint}>
                        Javoblar faqat creator uchun ko'rinadi.
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>

        <ArenaSentenceBuilderShareLinksSheet
          visible={Boolean(shareDeck)}
          deck={shareDeck}
          onClose={() => setShareDeck(null)}
        />
        <ArenaSentenceBuilderResultsSheet
          visible={Boolean(resultsDeck)}
          deck={resultsDeck}
          onClose={() => setResultsDeck(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSlot}>
            <Pressable style={styles.headerButton} onPress={handleBack}>
              <ArrowLeft size={20} color={Colors.text} />
            </Pressable>
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Gap tuzish</Text>
            <Text style={styles.headerCount}>
              ({myDeckCount}/{deckLimit})
            </Text>
          </View>

          <View style={[styles.headerSlot, styles.headerSlotEnd]}>
            <Pressable style={styles.headerButton} onPress={handleOpenCreate}>
              <Plus size={18} color={Colors.text} />
            </Pressable>
          </View>
        </View>

        {initialLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={decks}
            keyExtractor={(item, index) => String(item._id || item.urlSlug || index)}
            renderItem={renderDeckCard}
            extraData={`${menuState?.deck._id || ""}:${deletingDeckId || ""}`}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setMenuState(null);
                  void loadDecks(1, { replace: true });
                }}
                tintColor={Colors.primary}
              />
            }
            onScrollBeginDrag={() => setMenuState(null)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Text style={styles.emptyTitle}>Hozircha to'plam yo'q</Text>
                <Text style={styles.emptyText}>
                  Gap bo'laklaridan mashq qilish uchun birinchi to'plamni yarating.
                </Text>
              </View>
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : decks.length > 0 && !hasMore ? (
                <Text style={styles.footerText}>Hammasi ko'rsatildi</Text>
              ) : null
            }
          />
        )}

        <Modal
          visible={Boolean(activeMenuDeck)}
          transparent
          animationType="none"
          onRequestClose={() => setMenuState(null)}
        >
          <View style={styles.menuModalRoot}>
            <Pressable style={styles.menuBackdrop} onPress={() => setMenuState(null)} />
            {activeMenuDeck ? (
              <View
                style={[
                  styles.menuDropdownFloating,
                  {
                    left: menuLeft,
                    top: menuTop,
                  },
                ]}
              >
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuState(null);
                    void handleViewDeck(getSentenceBuilderDeckId(activeMenuDeck));
                  }}
                >
                  <Eye size={14} color={Colors.text} />
                  <Text style={styles.menuItemText}>Ko'rish</Text>
                </Pressable>

                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuState(null);
                    void handleStartPractice(activeMenuDeck);
                  }}
                >
                  <PlayCircle size={14} color={Colors.text} />
                  <Text style={styles.menuItemText}>Mashq qilish</Text>
                </Pressable>

                {activeMenuCanManage ? (
                  <>
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        setMenuState(null);
                        setShareDeck(activeMenuDeck);
                      }}
                    >
                      <Link2 size={14} color={Colors.text} />
                      <Text style={styles.menuItemText}>Havolalar</Text>
                    </Pressable>

                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        setMenuState(null);
                        setResultsDeck(activeMenuDeck);
                      }}
                    >
                      <BarChart3 size={14} color={Colors.text} />
                      <Text style={styles.menuItemText}>Natijalar</Text>
                    </Pressable>

                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        setMenuState(null);
                        setEditingDeck(activeMenuDeck);
                        setEditorVisible(true);
                      }}
                    >
                      <Pencil size={14} color={Colors.text} />
                      <Text style={styles.menuItemText}>Tahrirlash</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.menuItem, styles.menuItemDanger]}
                      onPress={() => {
                        setMenuState(null);
                        handleDeleteDeck(activeMenuDeck);
                      }}
                      disabled={deletingDeckId === getSentenceBuilderDeckId(activeMenuDeck)}
                    >
                      {deletingDeckId === getSentenceBuilderDeckId(activeMenuDeck) ? (
                        <ActivityIndicator size="small" color={Colors.danger} />
                      ) : (
                        <Trash2 size={14} color={Colors.danger} />
                      )}
                      <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                        O'chirish
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        </Modal>

        <ArenaSentenceBuilderEditorSheet
          visible={editorVisible}
          deck={editingDeck}
          onClose={() => {
            setEditorVisible(false);
            setEditingDeck(null);
          }}
          onSaved={handleSavedEditor}
        />
        <ArenaSentenceBuilderShareLinksSheet
          visible={Boolean(shareDeck)}
          deck={shareDeck}
          onClose={() => setShareDeck(null)}
        />
        <ArenaSentenceBuilderResultsSheet
          visible={Boolean(resultsDeck)}
          deck={resultsDeck}
          onClose={() => setResultsDeck(null)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    gap: 8,
  },
  headerSlot: {
    width: 48,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerSlotEnd: {
    alignItems: "flex-end",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  headerCount: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "600",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  headerButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  headerMetaPill: {
    minWidth: 76,
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  headerMetaPillText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 12,
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: "center",
  },
  footerText: {
    color: Colors.mutedText,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 18,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 18,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitleColumn: {
    flex: 1,
    gap: 8,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgePrimary: {
    backgroundColor: Colors.primarySoft,
  },
  badgeMuted: {
    backgroundColor: Colors.background,
  },
  badgeText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  badgeTextPrimary: {
    color: Colors.primary,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  cardDescription: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  cardMeta: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  cardHint: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardHintText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  menuModalRoot: {
    flex: 1,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  menuDropdownFloating: {
    position: "absolute",
    width: FLOATING_MENU_WIDTH,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  menuItem: {
    minHeight: 42,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuItemDanger: {
    backgroundColor: "rgba(239,68,68,0.05)",
  },
  menuItemText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  menuItemTextDanger: {
    color: Colors.danger,
  },
  detailContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 16,
  },
  detailHero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 18,
    gap: 8,
  },
  detailTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  detailDescription: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  detailMeta: {
    color: Colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
  },
  footerActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  questionList: {
    gap: 12,
  },
  questionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 10,
  },
  questionTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  questionPrompt: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 23,
  },
  sectionHint: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  practiceContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaTimerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#14b8a6",
  },
  practiceCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 14,
  },
  sectionLabel: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  promptText: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 30,
  },
  dropZone: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  dropZoneHint: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  tokenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tokenButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  tokenButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  tokenButtonCorrect: {
    borderColor: "rgba(34,197,94,0.5)",
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  tokenButtonWrong: {
    borderColor: "rgba(239,68,68,0.45)",
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  tokenChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tokenChipExpected: {
    borderColor: "rgba(34,197,94,0.3)",
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  tokenChipAnswerPreview: {
    borderColor: "rgba(59,130,246,0.28)",
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  tokenChipExtraPreview: {
    borderColor: "rgba(244,114,182,0.25)",
    backgroundColor: "rgba(244,114,182,0.12)",
  },
  tokenText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  feedbackCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  feedbackCardCorrect: {
    borderColor: "rgba(34,197,94,0.35)",
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  feedbackCardWrong: {
    borderColor: "rgba(239,68,68,0.32)",
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  feedbackTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  feedbackTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  mistakesWrap: {
    gap: 6,
  },
  mistakeText: {
    color: Colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  mistakeStrong: {
    fontWeight: "700",
    color: Colors.text,
  },
  practiceFooter: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexGrow: 1,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexGrow: 1,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  summaryHero: {
    borderRadius: 24,
    backgroundColor: Colors.primarySoft,
    paddingVertical: 24,
    alignItems: "center",
    gap: 6,
  },
  summaryHeroValue: {
    color: Colors.primary,
    fontSize: 40,
    fontWeight: "800",
  },
  summaryHeroLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minWidth: 100,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 6,
  },
  summaryCardLabel: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },
  summaryCardValue: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  resultList: {
    gap: 12,
  },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 10,
  },
  resultCardTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  resultCardState: {
    fontSize: 12,
    fontWeight: "700",
  },
  resultCardStateCorrect: {
    color: "#16a34a",
  },
  resultCardStateWrong: {
    color: Colors.danger,
  },
  helperText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
});
