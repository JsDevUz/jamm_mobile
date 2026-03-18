import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Crosshair,
  Layers3,
  RotateCcw,
  Sparkles,
  Target,
  Undo2,
  Volume2,
  X,
} from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { arenaApi } from "../../lib/api";
import { getFlashcardDeckCache, upsertFlashcardDeckCache } from "../../lib/flashcard-cache";
import type { RootStackParamList } from "../../navigation/types";
import { Colors } from "../../theme/colors";
import type {
  ArenaFlashcardCard,
  ArenaFlashcardDeck,
  ArenaFlashcardStudyMode,
} from "../../types/arena";

type Props = NativeStackScreenProps<RootStackParamList, "ArenaFlashcardStudy">;

type ReviewRating = 0 | 1 | 2 | 3;
type ClassicAnswer = {
  card: ArenaFlashcardCard;
  known: boolean;
};
type TestAnswer = {
  card: ArenaFlashcardCard;
  selectedOption: string;
  isCorrect: boolean;
};
type ShooterAnswer = {
  card: ArenaFlashcardCard;
  selectedOption: string;
  isCorrect: boolean;
};
type Direction = "left" | "right";
type ShooterTargetLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const CLASSIC_SWIPE_THRESHOLD = 110;
const SHOOTER_TARGET_POSITIONS = [
  { top: "25%", left: "15%" },
  { top: "20%", right: "15%" },
  { top: "50%", left: "12%" },
  { top: "45%", right: "12%" },
] as const;

const SpeechModule = (() => {
  try {
    return require("expo-speech") as {
      speak?: (text: string, options?: Record<string, unknown>) => void;
      stop?: () => void;
    };
  } catch {
    return null;
  }
})();

function shuffleArray<T>(value: T[]) {
  const next = [...value];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = temp;
  }
  return next;
}

function getModeTitle(mode: ArenaFlashcardStudyMode) {
  switch (mode) {
    case "review":
      return "Eslab qolish";
    case "classic":
      return "Flashcards";
    case "test":
      return "Test mashqi";
    case "shooter":
      return "Shooter";
    default:
      return "Flashcards";
  }
}

function getClassicStackLayout(depth: number) {
  const cappedDepth = Math.min(depth, 6);

  if (cappedDepth === 1) {
    return {
      offsetX: 0,
      offsetY: 0,
      rotate: 0,
      scale: 1,
      opacity: 1,
      zIndex: 5,
    };
  }

  return {
    offsetX: depth % 2 === 0 ? -8 - cappedDepth * 1.5 : 8 + cappedDepth * 1.5,
    offsetY: 4 + cappedDepth * 6,
    rotate: depth % 2 === 0 ? -1.4 - cappedDepth * 0.2 : 1.4 + cappedDepth * 0.2,
    scale: Math.max(0.9, 0.985 - cappedDepth * 0.017),
    opacity: Math.max(0.22, 0.82 - cappedDepth * 0.09),
    zIndex: Math.max(1, 5 - cappedDepth),
  };
}

function buildOptions(
  cards: ArenaFlashcardCard[],
  currentCard: ArenaFlashcardCard | null,
  getAnswerText: (card?: ArenaFlashcardCard | null) => string,
) {
  if (!currentCard) {
    return [];
  }

  const correctAnswer = getAnswerText(currentCard);
  const wrongOptions = cards
    .filter(
      (card) =>
        String(card._id || "") !== String(currentCard._id || "") &&
        getAnswerText(card) &&
        getAnswerText(card) !== correctAnswer,
    )
    .map((card) => getAnswerText(card));

  const uniqueWrongOptions = Array.from(new Set(wrongOptions));
  return shuffleArray(
    Array.from(
      new Set([correctAnswer, ...shuffleArray(uniqueWrongOptions).slice(0, 3)].filter(Boolean)),
    ),
  );
}

function speakFlashcardText(text: string) {
  const value = String(text || "").trim();
  if (!value) {
    return Promise.resolve(false);
  }

  const isArabic = /[\u0600-\u06FF]/.test(value);
  SpeechModule?.stop?.();

  if (SpeechModule?.speak) {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finalize = (result: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      SpeechModule.speak?.(value, {
        language: isArabic ? "ar-SA" : "en-US",
        rate: isArabic ? 0.92 : 0.96,
        pitch: 1,
        onDone: () => finalize(true),
        onStopped: () => finalize(false),
        onError: () => finalize(false),
      });
    });
  }

  return Promise.resolve(false);
}

function StudyFace({
  imageUri,
  text,
  caption,
}: {
  imageUri?: string | null;
  text: string;
  caption?: string;
}) {
  return (
    <View style={styles.faceCard}>
      {caption ? <Text style={styles.faceCaption}>{caption}</Text> : null}
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.faceImage} contentFit="contain" />
      ) : null}
      <Text style={styles.faceText}>{text || "???"}</Text>
    </View>
  );
}

function ResultSummary({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.resultShell}>
      <View style={styles.resultBadge}>
        <Target size={20} color={Colors.primary} />
      </View>
      <Text style={styles.resultTitle}>{title}</Text>
      <Text style={styles.resultSubtitle}>{subtitle}</Text>
      {children}
    </View>
  );
}

function ModeIcon({ mode }: { mode: ArenaFlashcardStudyMode }) {
  if (mode === "review") {
    return <Sparkles size={16} color={Colors.primary} />;
  }
  if (mode === "classic") {
    return <Layers3 size={16} color={Colors.primary} />;
  }
  if (mode === "test") {
    return <CheckCircle2 size={16} color={Colors.primary} />;
  }
  return <Crosshair size={16} color={Colors.primary} />;
}

function getTargetFloatPattern(index: number) {
  switch (index % 4) {
    case 0:
      return [
        { x: 16, y: -18, scale: 1.03 },
        { x: -10, y: -34, scale: 0.98 },
        { x: 20, y: -8, scale: 1.02 },
        { x: 0, y: 0, scale: 1 },
      ];
    case 1:
      return [
        { x: -20, y: -16, scale: 0.98 },
        { x: 10, y: -30, scale: 1.04 },
        { x: -14, y: -10, scale: 1.01 },
        { x: 0, y: 0, scale: 1 },
      ];
    case 2:
      return [
        { x: 12, y: -26, scale: 1.02 },
        { x: -16, y: -18, scale: 0.99 },
        { x: 6, y: -4, scale: 1.03 },
        { x: 0, y: 0, scale: 1 },
      ];
    default:
      return [
        { x: -18, y: -28, scale: 1.04 },
        { x: 14, y: -12, scale: 0.99 },
        { x: -10, y: -2, scale: 1.02 },
        { x: 0, y: 0, scale: 1 },
      ];
  }
}

export function ArenaFlashcardStudyScreen({ navigation, route }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const seededDeck = route.params.deck ?? null;
  const deckId = String(route.params.deckId || seededDeck?._id || "");
  const mode = route.params.mode;
  const promptSide = route.params.promptSide;
  const [deck, setDeck] = useState<ArenaFlashcardDeck | null>(seededDeck);
  const [loading, setLoading] = useState(!seededDeck);

  const [reviewQueue, setReviewQueue] = useState<ArenaFlashcardCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewShowAnswer, setReviewShowAnswer] = useState(false);
  const [reviewCompleted, setReviewCompleted] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [classicQueue, setClassicQueue] = useState<ArenaFlashcardCard[]>([]);
  const [classicIndex, setClassicIndex] = useState(0);
  const [classicShowBack, setClassicShowBack] = useState(false);
  const [classicRenderedBack, setClassicRenderedBack] = useState(false);
  const [classicSpeakingSide, setClassicSpeakingSide] = useState<"prompt" | "answer" | null>(null);
  const [classicAnswers, setClassicAnswers] = useState<ClassicAnswer[]>([]);
  const [classicCompleted, setClassicCompleted] = useState(false);
  const [classicDragging, setClassicDragging] = useState(false);
  const [classicExitDirection, setClassicExitDirection] = useState<Direction | null>(null);
  const [classicDragAmount, setClassicDragAmount] = useState(0);

  const [testQueue, setTestQueue] = useState<ArenaFlashcardCard[]>([]);
  const [testIndex, setTestIndex] = useState(0);
  const [testAnswers, setTestAnswers] = useState<TestAnswer[]>([]);
  const [testCompleted, setTestCompleted] = useState(false);
  const [selectedTestOption, setSelectedTestOption] = useState<string | null>(null);

  const [shooterQueue, setShooterQueue] = useState<ArenaFlashcardCard[]>([]);
  const [shooterIndex, setShooterIndex] = useState(0);
  const [shooterAnswers, setShooterAnswers] = useState<ShooterAnswer[]>([]);
  const [shooterCompleted, setShooterCompleted] = useState(false);
  const [shooterLocked, setShooterLocked] = useState(false);
  const [shooterStreak, setShooterStreak] = useState(0);
  const [cannonAngle, setCannonAngle] = useState(0);
  const [boardLayout, setBoardLayout] = useState({ width: 0, height: 0 });
  const [projectileTarget, setProjectileTarget] = useState<{ x: number; y: number } | null>(null);
  const [explosionData, setExplosionData] = useState<{ x: number; y: number } | null>(null);
  const [wrongOption, setWrongOption] = useState<string | null>(null);
  const [hiddenOption, setHiddenOption] = useState<string | null>(null);
  const [targetLayouts, setTargetLayouts] = useState<Record<string, ShooterTargetLayout>>({});

  const classicDragX = useRef(new Animated.Value(0)).current;
  const classicFlipProgress = useRef(new Animated.Value(0)).current;
  const classicDragValueRef = useRef(0);
  const classicRenderedBackRef = useRef(false);
  const projectileProgress = useRef(new Animated.Value(0)).current;
  const explosionScale = useRef(new Animated.Value(0.15)).current;
  const explosionOpacity = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const floatX = useRef(SHOOTER_TARGET_POSITIONS.map(() => new Animated.Value(0))).current;
  const floatY = useRef(SHOOTER_TARGET_POSITIONS.map(() => new Animated.Value(0))).current;
  const floatScale = useRef(SHOOTER_TARGET_POSITIONS.map(() => new Animated.Value(1))).current;
  const shooterResolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shooterAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listenerId = classicDragX.addListener(({ value }) => {
      classicDragValueRef.current = value;
      setClassicDragAmount(value);
    });

    return () => {
      classicDragX.removeListener(listenerId);
    };
  }, [classicDragX]);

  useEffect(() => {
    const listenerId = classicFlipProgress.addListener(({ value }) => {
      const shouldRenderBack = value >= 0.5;
      if (shouldRenderBack !== classicRenderedBackRef.current) {
        classicRenderedBackRef.current = shouldRenderBack;
        setClassicRenderedBack(shouldRenderBack);
      }
    });

    return () => {
      classicFlipProgress.removeListener(listenerId);
    };
  }, [classicFlipProgress]);

  useEffect(() => {
    Animated.spring(classicFlipProgress, {
      toValue: classicShowBack ? 1 : 0,
      damping: 18,
      stiffness: 220,
      mass: 0.95,
      useNativeDriver: true,
    }).start();
  }, [classicFlipProgress, classicShowBack]);

  useEffect(() => {
    return () => {
      SpeechModule?.stop?.();
      if (shooterResolveTimeoutRef.current) {
        clearTimeout(shooterResolveTimeoutRef.current);
      }
      if (shooterAdvanceTimeoutRef.current) {
        clearTimeout(shooterAdvanceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (seededDeck && Array.isArray(seededDeck.cards) && seededDeck.cards.length > 0) {
      setDeck(seededDeck);
      setLoading(false);
      void upsertFlashcardDeckCache(seededDeck);
      return () => {
        active = false;
      };
    }

    if (!deckId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void (async () => {
      setLoading(true);
      let hadLocalDeck = false;
      try {
        const cachedDeck = await getFlashcardDeckCache(deckId);
        if (active && cachedDeck?.cards?.length) {
          setDeck(cachedDeck);
          setLoading(false);
          hadLocalDeck = true;
        }

        const payload = await arenaApi.fetchFlashcardDeck(deckId);
        if (active) {
          setDeck(payload);
        }
        await upsertFlashcardDeckCache(payload);
      } catch (error) {
        if (active && !hadLocalDeck) {
          Alert.alert(
            "Lugat yuklanmadi",
            error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [deckId, seededDeck]);

  const cards = useMemo(
    () => (Array.isArray(deck?.cards) ? deck.cards.filter((card) => card.front && card.back) : []),
    [deck?.cards],
  );

  const getPromptText = useCallback(
    (card?: ArenaFlashcardCard | null) =>
      String(promptSide === "front" ? card?.front || "" : card?.back || ""),
    [promptSide],
  );
  const getAnswerText = useCallback(
    (card?: ArenaFlashcardCard | null) =>
      String(promptSide === "front" ? card?.back || "" : card?.front || ""),
    [promptSide],
  );
  const getPromptImage = useCallback(
    (card?: ArenaFlashcardCard | null) =>
      String(promptSide === "front" ? card?.frontImage || "" : card?.backImage || ""),
    [promptSide],
  );
  const getAnswerImage = useCallback(
    (card?: ArenaFlashcardCard | null) =>
      String(promptSide === "front" ? card?.backImage || "" : card?.frontImage || ""),
    [promptSide],
  );

  const resetClassicCardMotion = useCallback(() => {
    classicDragX.stopAnimation();
    classicDragX.setValue(0);
    classicFlipProgress.stopAnimation();
    classicFlipProgress.setValue(0);
    classicDragValueRef.current = 0;
    classicRenderedBackRef.current = false;
    setClassicRenderedBack(false);
    setClassicSpeakingSide(null);
    setClassicDragAmount(0);
    setClassicDragging(false);
    setClassicExitDirection(null);
  }, [classicDragX, classicFlipProgress]);

  const resetReviewSession = useCallback((sourceCards: ArenaFlashcardCard[]) => {
    const now = new Date();
    const dueCards = sourceCards.filter((card) => {
      const nextReviewDate = card.nextReviewDate ? new Date(card.nextReviewDate) : now;
      return Number.isNaN(nextReviewDate.getTime()) || nextReviewDate <= now;
    });

    setReviewQueue(dueCards.length > 0 ? dueCards : sourceCards);
    setReviewIndex(0);
    setReviewShowAnswer(false);
    setReviewCompleted(false);
    setReviewSubmitting(false);
  }, []);

  const resetClassicSession = useCallback(
    (sourceCards: ArenaFlashcardCard[]) => {
      setClassicQueue([...sourceCards]);
      setClassicIndex(0);
      setClassicShowBack(false);
      setClassicAnswers([]);
      setClassicCompleted(false);
      resetClassicCardMotion();
    },
    [resetClassicCardMotion],
  );

  const resetTestSession = useCallback((sourceCards: ArenaFlashcardCard[]) => {
    setTestQueue([...sourceCards]);
    setTestIndex(0);
    setTestAnswers([]);
    setTestCompleted(false);
    setSelectedTestOption(null);
  }, []);

  const resetShooterSession = useCallback((sourceCards: ArenaFlashcardCard[]) => {
    setShooterQueue(shuffleArray(sourceCards));
    setShooterIndex(0);
    setShooterAnswers([]);
    setShooterCompleted(false);
    setShooterLocked(false);
    setShooterStreak(0);
    setCannonAngle(0);
    setProjectileTarget(null);
    setExplosionData(null);
    setWrongOption(null);
    setHiddenOption(null);
    setTargetLayouts({});
    projectileProgress.stopAnimation();
    projectileProgress.setValue(0);
    explosionScale.setValue(0.15);
    explosionOpacity.setValue(0);
    shakeX.setValue(0);
  }, [explosionOpacity, explosionScale, projectileProgress, shakeX]);

  useEffect(() => {
    if (cards.length === 0) {
      return;
    }

    if (mode === "review") {
      resetReviewSession(cards);
      return;
    }

    if (mode === "classic") {
      resetClassicSession(cards);
      return;
    }

    if (mode === "test") {
      resetTestSession(cards);
      return;
    }

    resetShooterSession(cards);
  }, [cards, mode, resetClassicSession, resetReviewSession, resetShooterSession, resetTestSession]);

  const currentReviewCard = reviewQueue[reviewIndex] || null;
  const currentClassicCard = classicQueue[classicIndex] || null;
  const currentTestCard = testQueue[testIndex] || null;
  const currentShooterCard = shooterQueue[shooterIndex] || null;
  const testOptions = useMemo(
    () => buildOptions(testQueue, currentTestCard, getAnswerText),
    [currentTestCard, getAnswerText, testQueue],
  );
  const shooterOptions = useMemo(
    () => buildOptions(shooterQueue, currentShooterCard, getAnswerText),
    [currentShooterCard, getAnswerText, shooterQueue],
  );

  useEffect(() => {
    if (mode !== "shooter" || shooterCompleted || shooterOptions.length === 0) {
      return;
    }

    const animations = SHOOTER_TARGET_POSITIONS.map((_, index) => {
      const pattern = getTargetFloatPattern(index);
      const duration = 1400 + index * 180;

      return Animated.loop(
        Animated.sequence(
          pattern.map((step) =>
            Animated.parallel([
              Animated.timing(floatX[index], {
                toValue: step.x,
                duration,
                useNativeDriver: true,
              }),
              Animated.timing(floatY[index], {
                toValue: step.y,
                duration,
                useNativeDriver: true,
              }),
              Animated.timing(floatScale[index], {
                toValue: step.scale,
                duration,
                useNativeDriver: true,
              }),
            ]),
          ),
        ),
      );
    });

    animations.forEach((animation) => animation.start());

    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [floatScale, floatX, floatY, mode, shooterCompleted, shooterOptions.length]);

  const classicSwipeProgress = Math.min(Math.abs(classicDragAmount) / 120, 1);
  const classicPromptImage = getPromptImage(currentClassicCard);
  const classicAnswerImage = getAnswerImage(currentClassicCard);
  const classicPromptText = getPromptText(currentClassicCard) || "???";
  const classicAnswerText = getAnswerText(currentClassicCard) || "???";
  const classicVisibleImage = classicRenderedBack ? classicAnswerImage : classicPromptImage;
  const classicVisibleText = classicRenderedBack ? classicAnswerText : classicPromptText;
  const classicKnownCount = classicAnswers.filter((item) => item.known).length;
  const classicMissedCount = classicAnswers.filter((item) => !item.known).length;
  const reviewRemaining = Math.max(reviewQueue.length - reviewIndex, 0);
  const testCorrectCount = testAnswers.filter((item) => item.isCorrect).length;
  const shooterCorrectCount = shooterAnswers.filter((item) => item.isCorrect).length;
  const shooterAccuracy = shooterAnswers.length
    ? Math.round((shooterCorrectCount / shooterAnswers.length) * 100)
    : 0;
  const classicProgressValue = classicQueue.length
    ? ((classicCompleted ? classicQueue.length : classicIndex + 1) / classicQueue.length) * 100
    : 0;
  const classicCardWidth = Math.min(screenWidth - 40, 420);
  const classicCardHeight = Math.min(Math.max(screenHeight * 0.56, 420), 560);

  const classicDragRotate = classicDragX.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: ["-18deg", "0deg", "18deg"],
  });
  const classicDragScale = classicDragX.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: [0.95, 1, 0.95],
  });
  const classicFlipRotate = classicFlipProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const goBackToList = useCallback(() => {
    SpeechModule?.stop?.();
    navigation.navigate("ArenaFlashcardList");
  }, [navigation]);

  const speakClassicCard = useCallback(
    async (side: "prompt" | "answer") => {
      const currentCard = classicQueue[classicIndex];
      if (!currentCard || classicSpeakingSide) {
        return;
      }

      setClassicSpeakingSide(side);
      try {
        await speakFlashcardText(
          side === "answer" ? getAnswerText(currentCard) : getPromptText(currentCard),
        );
      } finally {
        setClassicSpeakingSide((current) => (current === side ? null : current));
      }
    },
    [classicIndex, classicQueue, classicSpeakingSide, getAnswerText, getPromptText],
  );

  const handleReviewRating = async (rating: ReviewRating) => {
    if (!currentReviewCard?._id || !deck?._id || reviewSubmitting) {
      return;
    }

    setReviewSubmitting(true);
    try {
      await arenaApi.reviewFlashcard(String(deck._id), String(currentReviewCard._id), rating);
    } catch (error) {
      Alert.alert(
        "Progress saqlanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setReviewSubmitting(false);
    }

    if (rating < 3) {
      setReviewQueue((prev) => [...prev, currentReviewCard]);
    }

    const nextIndex = reviewIndex + 1;
    if (nextIndex >= reviewQueue.length + (rating < 3 ? 1 : 0)) {
      setReviewCompleted(true);
      setReviewShowAnswer(false);
      return;
    }

    setReviewIndex(nextIndex);
    setReviewShowAnswer(false);
  };

  const completeClassicSwipe = useCallback(
    (direction: Direction) => {
      const currentCard = classicQueue[classicIndex];
      if (!currentCard) {
        resetClassicCardMotion();
        return;
      }

      const known = direction === "left";
      setClassicExitDirection(direction);
      setClassicAnswers((prev) => [...prev, { card: currentCard, known }]);

      Animated.timing(classicDragX, {
        toValue: direction === "right" ? screenWidth + 120 : -screenWidth - 120,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        const isLast = classicIndex + 1 >= classicQueue.length;
        if (isLast) {
          setClassicCompleted(true);
        } else {
          setClassicIndex((value) => value + 1);
        }
        setClassicShowBack(false);
        resetClassicCardMotion();
      });
    },
    [
      classicDragX,
      classicIndex,
      classicQueue,
      classicShowBack,
      resetClassicCardMotion,
      screenWidth,
    ],
  );

  const handleClassicReplay = useCallback(() => {
    if (classicIndex === 0 || classicAnswers.length === 0) {
      return;
    }

    const nextAnswers = [...classicAnswers];
    nextAnswers.pop();
    setClassicAnswers(nextAnswers);
    setClassicIndex((value) => Math.max(value - 1, 0));
    setClassicShowBack(false);
    setClassicCompleted(false);
    resetClassicCardMotion();
  }, [classicAnswers, classicIndex, resetClassicCardMotion]);

  const animateClassicCardBack = useCallback(() => {
    Animated.spring(classicDragX, {
      toValue: 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
    }).start();
  }, [classicDragX]);

  const handleClassicGestureStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, oldState, translationX, velocityX } = event.nativeEvent;

      if (state === State.BEGAN) {
        classicDragX.stopAnimation();
        return;
      }

      if (oldState !== State.ACTIVE) {
        if (state === State.CANCELLED || state === State.FAILED || state === State.END) {
          setClassicDragging(false);
        }
        return;
      }

      setClassicDragging(false);

      const shouldSwipe =
        Math.abs(translationX) >= CLASSIC_SWIPE_THRESHOLD ||
        (Math.abs(velocityX) >= 850 && Math.abs(translationX) >= 30);

      if (shouldSwipe) {
        completeClassicSwipe(translationX > 0 ? "right" : "left");
        return;
      }

      animateClassicCardBack();
    },
    [animateClassicCardBack, classicDragX, completeClassicSwipe],
  );

  const handleClassicGestureEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { translationX: classicDragX } }], {
        useNativeDriver: true,
        listener: (event) => {
          const translationX = Number(
            (event as { nativeEvent?: { translationX?: number } })?.nativeEvent?.translationX || 0,
          );
          if (Math.abs(translationX) > 4) {
            setClassicDragging(true);
          }
        },
      }),
    [classicDragX],
  );

  const handleClassicCardPress = () => {
    if (classicExitDirection) {
      return;
    }

    setClassicShowBack((value) => !value);
  };

  const restartClassicMissed = () => {
    const missedCards = classicAnswers.filter((item) => !item.known).map((item) => item.card);
    if (missedCards.length === 0) {
      return;
    }

    resetClassicSession(missedCards);
  };

  const handleTestAnswer = (selectedOption: string) => {
    if (!currentTestCard || selectedTestOption) {
      return;
    }

    const isCorrect = selectedOption === getAnswerText(currentTestCard);
    setSelectedTestOption(selectedOption);

    setTimeout(() => {
      const nextAnswers = [...testAnswers, { card: currentTestCard, selectedOption, isCorrect }];
      setTestAnswers(nextAnswers);

      if (testIndex + 1 >= testQueue.length) {
        setTestCompleted(true);
        setSelectedTestOption(null);
        return;
      }

      setTestIndex((value) => value + 1);
      setSelectedTestOption(null);
    }, 180);
  };

  const restartTestMissed = () => {
    const missedCards = testAnswers.filter((item) => !item.isCorrect).map((item) => item.card);
    if (missedCards.length === 0) {
      return;
    }

    resetTestSession(missedCards);
  };

  const runBoardShake = useCallback(() => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -6, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 6, duration: 70, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -4, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 4, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [shakeX]);

  const runExplosion = useCallback((x: number, y: number) => {
    setExplosionData({ x, y });
    explosionScale.setValue(0.15);
    explosionOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(explosionScale, {
        toValue: 1.45,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(explosionOpacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setExplosionData(null);
    });
  }, [explosionOpacity, explosionScale]);

  const handleTargetLayout = (option: string, event: LayoutChangeEvent) => {
    const layout = event.nativeEvent.layout;
    setTargetLayouts((prev) => ({
      ...prev,
      [option]: {
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
      },
    }));
  };

  const handleShooterAnswer = (selectedOption: string) => {
    if (!currentShooterCard || shooterLocked || !boardLayout.width || !boardLayout.height) {
      return;
    }

    const targetLayout = targetLayouts[selectedOption];
    if (!targetLayout) {
      return;
    }

    const targetCenterX = targetLayout.x + targetLayout.width / 2;
    const targetCenterY = targetLayout.y + targetLayout.height / 2;
    const cannonBaseX = boardLayout.width / 2;
    const cannonBaseY = boardLayout.height - 60;
    const dx = targetCenterX - cannonBaseX;
    const dy = targetCenterY - cannonBaseY;
    const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    const correctAnswer = getAnswerText(currentShooterCard);
    const isCorrect = selectedOption === correctAnswer;

    setCannonAngle(angle);
    setProjectileTarget({ x: dx, y: dy });
    setShooterLocked(true);
    projectileProgress.setValue(0);

    Animated.timing(projectileProgress, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setProjectileTarget(null);
      projectileProgress.setValue(0);
    });

    shooterResolveTimeoutRef.current = setTimeout(() => {
      if (isCorrect) {
        setHiddenOption(selectedOption);
        setWrongOption(null);
        setShooterStreak((value) => value + 1);
        runExplosion(targetCenterX, targetCenterY);
      } else {
        setWrongOption(selectedOption);
        setShooterStreak(0);
        runBoardShake();
      }

      const nextAnswers = [
        ...shooterAnswers,
        {
          card: currentShooterCard,
          selectedOption,
          isCorrect,
        },
      ];

      shooterAdvanceTimeoutRef.current = setTimeout(() => {
        setWrongOption(null);
        setHiddenOption(null);
        setShooterAnswers(nextAnswers);
        setTargetLayouts({});

        if (shooterIndex + 1 >= shooterQueue.length) {
          setShooterCompleted(true);
          setShooterLocked(false);
          return;
        }

        setShooterIndex((value) => value + 1);
        setShooterLocked(false);
      }, 600);
    }, 250);
  };

  const restartShooterMissed = () => {
    const missedCards = shooterAnswers
      .filter((item) => !item.isCorrect)
      .map((item) => item.card);
    if (missedCards.length === 0) {
      return;
    }

    resetShooterSession(missedCards);
  };

  const stackedCards = classicQueue.slice(classicIndex + 1);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.root}>
        {mode === "classic" && cards.length > 0 && !loading ? (
          <View style={styles.classicRoot}>
            {!classicCompleted ? (
              <>
                <View style={styles.classicTopBar}>
                  <Pressable style={styles.classicTopButton} onPress={goBackToList}>
                    <X size={22} color={Colors.text} />
                  </Pressable>

                  <View style={styles.classicTopCenter}>
                    <Text style={styles.classicTopCounter}>
                      {classicIndex + 1} / {classicQueue.length}
                    </Text>
                    <Text style={styles.classicTopTitle}>{deck?.title || "Flashcards"}</Text>
                  </View>

                  <Pressable
                    style={[
                      styles.classicTopButton,
                      (classicIndex === 0 || classicAnswers.length === 0) &&
                        styles.classicTopButtonDisabled,
                    ]}
                    disabled={classicIndex === 0 || classicAnswers.length === 0}
                    onPress={handleClassicReplay}
                  >
                    <Undo2 size={20} color={Colors.text} />
                  </Pressable>
                </View>

                <View style={styles.classicProgressTrack}>
                  <View style={[styles.classicProgressFill, { width: `${classicProgressValue}%` }]} />
                </View>

                <View style={styles.classicFloatingCounters}>
                  <View style={styles.classicFloatingCounterLeft}>
                    <Text style={styles.classicFloatingCounterText}>{classicKnownCount}</Text>
                  </View>
                  <View style={styles.classicFloatingCounterRight}>
                    <Text style={styles.classicFloatingCounterText}>{classicMissedCount}</Text>
                  </View>
                </View>

                <View style={styles.classicViewport}>
                  <View style={[styles.classicStage, { width: classicCardWidth, height: classicCardHeight }]}>
                    {stackedCards
                      .map((card, idx) => ({ card, depth: idx + 1 }))
                      .reverse()
                      .map(({ card, depth }) => {
                        const layout = getClassicStackLayout(depth);
                        if (depth !== 1) {
                          return (
                            <View
                              key={String(card._id || `classic-stack-${depth}`)}
                              style={[
                                styles.classicStackSurface,
                                {
                                  width: classicCardWidth,
                                  height: classicCardHeight,
                                  opacity: layout.opacity,
                                  zIndex: layout.zIndex,
                                  transform: [
                                    { translateX: layout.offsetX },
                                    { translateY: layout.offsetY },
                                    { rotate: `${layout.rotate}deg` },
                                    { scale: layout.scale },
                                  ],
                                },
                              ]}
                            />
                          );
                        }

                        return (
                          <View
                            key={String(card._id || `classic-preview-${depth}`)}
                            style={[
                              styles.classicPreviewCard,
                              {
                                width: classicCardWidth,
                                height: classicCardHeight,
                                opacity: layout.opacity,
                                zIndex: layout.zIndex,
                                transform: [
                                  { translateX: layout.offsetX },
                                  { translateY: layout.offsetY },
                                  { rotate: `${layout.rotate}deg` },
                                  { scale: layout.scale },
                                ],
                              },
                            ]}
                          >
                            <View style={styles.classicCardToolbar}>
                              <View style={styles.classicToolbarGhost}>
                                <Volume2 size={20} color={Colors.mutedText} />
                              </View>
                            </View>
                            <View style={styles.classicCardBody}>
                              {getPromptImage(card) ? (
                                <Image
                                  source={{ uri: getPromptImage(card) }}
                                  style={styles.classicCardImage}
                                  contentFit="contain"
                                />
                              ) : null}
                              <Text style={styles.classicPreviewText}>{getPromptText(card) || "???"}</Text>
                            </View>
                          </View>
                        );
                      })}

                    {currentClassicCard ? (
                      <PanGestureHandler
                        enabled={!classicCompleted && !classicExitDirection}
                        activeOffsetX={[-10, 10]}
                        failOffsetY={[-14, 14]}
                        shouldCancelWhenOutside={false}
                        onGestureEvent={handleClassicGestureEvent}
                        onHandlerStateChange={handleClassicGestureStateChange}
                      >
                        <Animated.View
                          needsOffscreenAlphaCompositing
                          renderToHardwareTextureAndroid
                          style={[
                            styles.classicSwipeCard,
                            {
                              width: classicCardWidth,
                              height: classicCardHeight,
                              transform: [
                                { translateX: classicDragX },
                                { rotate: classicDragRotate },
                                { scale: classicDragScale },
                              ],
                            },
                          ]}
                        >
                          <Pressable style={styles.classicSwipeCardPressable} onPress={handleClassicCardPress}>
                            <Animated.View
                              needsOffscreenAlphaCompositing
                              renderToHardwareTextureAndroid
                              style={[
                                styles.classicFlipShell,
                                {
                                  transform: [
                                    { perspective: 1200 },
                                    { rotateY: classicFlipRotate },
                                  ],
                                },
                              ]}
                            >
                              <View style={styles.classicFlipLayer}>
                                <View
                                  style={[
                                    styles.classicCardFace,
                                    classicRenderedBack
                                      ? styles.classicCardFaceBack
                                      : styles.classicCardFaceFront,
                                  ]}
                                >
                                  <View
                                    style={
                                      classicRenderedBack
                                        ? styles.classicCardFaceMirrorFix
                                        : {flex:1}
                                    }
                                  >
                                    <View style={styles.classicCardToolbar}>
                                    <Pressable
                                      style={styles.classicToolbarButton}
                                      onPress={() =>
                                        speakClassicCard(
                                          classicRenderedBack ? "answer" : "prompt",
                                        )
                                      }
                                      disabled={Boolean(classicSpeakingSide)}
                                    >
                                      {classicSpeakingSide ===
                                      (classicRenderedBack ? "answer" : "prompt") ? (
                                        <ActivityIndicator size="small" color={Colors.text} />
                                      ) : (
                                        <Volume2 size={20} color={Colors.text} />
                                      )}
                                    </Pressable>
                                    </View>
                                    <View style={styles.classicCardBody}>
                                      {classicVisibleImage ? (
                                        <Image
                                          source={{ uri: classicVisibleImage }}
                                          style={styles.classicCardImage}
                                          contentFit="contain"
                                        />
                                      ) : null}
                                      <Text
                                        style={[
                                          styles.classicCardWord,
                                          {
                                            opacity: Math.max(
                                              0.34,
                                              1 - classicSwipeProgress * 0.36,
                                            ),
                                          },
                                        ]}
                                      >
                                        {classicVisibleText}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>
                            </Animated.View>

                            <View
                              pointerEvents="none"
                              style={[
                                styles.classicActionHint,
                                styles.classicActionHintLeft,
                                {
                                  opacity: classicDragAmount > 0 ? classicSwipeProgress : 0,
                                },
                              ]}
                            >
                              <Text
                                style={[styles.classicActionHintText, styles.classicActionHintTextDanger]}
                              >
                                Topolmadim
                              </Text>
                            </View>
                            <View
                              pointerEvents="none"
                              style={[
                                styles.classicActionHint,
                                styles.classicActionHintRight,
                                {
                                  opacity: classicDragAmount < 0 ? classicSwipeProgress : 0,
                                },
                              ]}
                            >
                              <Text
                                style={[styles.classicActionHintText, styles.classicActionHintTextSuccess]}
                              >
                                Topdim
                              </Text>
                            </View>
                          </Pressable>
                        </Animated.View>
                      </PanGestureHandler>
                    ) : null}
                  </View>

                  <Text style={styles.classicHelperText}>
                    Kartani bosing, u flip bo'ladi. Chapga suring: topdim. O'ngga suring:
                    topolmadim.
                  </Text>
                </View>
              </>
            ) : (
              <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.header}>
                  <Pressable style={styles.backButton} onPress={goBackToList}>
                    <ArrowLeft size={20} color={Colors.text} />
                  </Pressable>
                  <View style={styles.headerContent}>
                    <View style={styles.headerModeRow}>
                      <Layers3 size={16} color={Colors.primary} />
                      <Text style={styles.headerModeLabel}>Flashcards</Text>
                    </View>
                    <Text style={styles.headerTitle}>{deck?.title || "Flashcards"}</Text>
                  </View>
                </View>

                <ResultSummary
                  title="Flashcard session tugadi"
                  subtitle="Xatolarni alohida yoki to'liq deckni qayta ishlashingiz mumkin."
                >
                  <View style={styles.resultActions}>
                    <Pressable
                      style={[
                        styles.secondaryAction,
                        classicMissedCount === 0 && styles.actionDisabled,
                      ]}
                      disabled={classicMissedCount === 0}
                      onPress={restartClassicMissed}
                    >
                      <RotateCcw size={16} color={Colors.text} />
                      <Text style={styles.secondaryActionText}>Topilmaganlar</Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() => resetClassicSession(cards)}
                    >
                      <RotateCcw size={16} color={Colors.text} />
                      <Text style={styles.secondaryActionText}>Barchasi</Text>
                    </Pressable>
                    <Pressable style={styles.primaryAction} onPress={goBackToList}>
                      <Text style={styles.primaryActionText}>Ro'yxatga qaytish</Text>
                    </Pressable>
                  </View>

                  <View style={styles.answerReviewColumn}>
                    {classicAnswers.map((item, index) => (
                      <View
                        key={`classic-answer-${item.card._id || index}`}
                        style={styles.answerReviewCard}
                      >
                        <Text style={styles.answerReviewLabel}>
                          {index + 1}. {getPromptText(item.card)}
                        </Text>
                        <Text style={styles.answerReviewMeta}>
                          Javob: {getAnswerText(item.card)}
                        </Text>
                        <Text
                          style={[
                            styles.answerReviewMeta,
                            item.known ? styles.answerCorrect : styles.answerWrong,
                          ]}
                        >
                          Holat: {item.known ? "Topdi" : "Topolmadi"}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ResultSummary>
              </ScrollView>
            )}
          </View>
        ) : mode === "shooter" && cards.length > 0 && !loading ? (
          <View style={styles.shooterRoot}>
            {!shooterCompleted ? (
              <>
                <View style={styles.header}>
                  <Pressable style={styles.backButton} onPress={goBackToList}>
                    <ArrowLeft size={20} color={Colors.text} />
                  </Pressable>
                  <View style={styles.headerContent}>
                    <View style={styles.headerModeRow}>
                      <Crosshair size={16} color={Colors.primary} />
                      <Text style={styles.headerModeLabel}>Shooter</Text>
                    </View>
                    <Text style={styles.headerTitle}>{deck?.title || "Shooter"}</Text>
                  </View>
                </View>

                <View style={styles.shooterMetaGrid}>
                  <View style={styles.shooterMetaCard}>
                    <Text style={styles.shooterMetaLabel}>Savol</Text>
                    <Text style={styles.shooterMetaValue}>
                      {shooterIndex + 1}/{shooterQueue.length}
                    </Text>
                  </View>
                  <View style={styles.shooterMetaCard}>
                    <Text style={styles.shooterMetaLabel}>Topildi</Text>
                    <Text style={styles.shooterMetaValue}>{shooterCorrectCount}</Text>
                  </View>
                  <View style={styles.shooterMetaCard}>
                    <Text style={styles.shooterMetaLabel}>Streak</Text>
                    <Text style={styles.shooterMetaValue}>{shooterStreak}</Text>
                  </View>
                </View>

                <Animated.View
                  style={[styles.shooterBoard, { transform: [{ translateX: shakeX }] }]}
                  onLayout={(event) => {
                    const layout = event.nativeEvent.layout;
                    setBoardLayout({
                      width: layout.width,
                      height: layout.height,
                    });
                  }}
                >
                  <View style={styles.shooterStarsLayer} />
                  <View style={styles.shooterPromptBar}>
                    <Text style={styles.shooterPromptBarText}>
                      {getPromptText(currentShooterCard)}
                    </Text>
                  </View>

                  <View style={styles.shooterArena}>
                    {shooterOptions.map((option, index) => (
                      <Animated.View
                        key={`${shooterIndex}-${option}`}
                        style={[
                          styles.shooterTargetWrap,
                          SHOOTER_TARGET_POSITIONS[index] || SHOOTER_TARGET_POSITIONS[0],
                          {
                            opacity: hiddenOption === option ? 0 : 1,
                            transform: [
                              { translateX: floatX[index] || 0 },
                              { translateY: floatY[index] || 0 },
                              { scale: floatScale[index] || 1 },
                              { scale: hiddenOption === option ? 0.82 : 1 },
                            ],
                          },
                        ]}
                        onLayout={(event) => handleTargetLayout(option, event)}
                      >
                        <Pressable
                          style={[
                            styles.shooterTarget,
                            wrongOption === option && styles.shooterTargetWrong,
                            hiddenOption === option && styles.shooterTargetHidden,
                          ]}
                          disabled={shooterLocked || hiddenOption === option}
                          onPress={() => handleShooterAnswer(option)}
                        >
                          <Target size={18} color="#F8FAFC" />
                          <Text style={styles.shooterTargetText}>{option}</Text>
                        </Pressable>
                      </Animated.View>
                    ))}

                    {projectileTarget && boardLayout.width ? (
                      <Animated.View
                        style={[
                          styles.projectile,
                          {
                            left: boardLayout.width / 2 - 6,
                            top: boardLayout.height - 84,
                            opacity: projectileProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 0.82],
                            }),
                            transform: [
                              {
                                translateX: Animated.multiply(projectileProgress, projectileTarget.x),
                              },
                              {
                                translateY: Animated.multiply(projectileProgress, projectileTarget.y),
                              },
                              {
                                scale: projectileProgress.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.55, 1.35],
                                }),
                              },
                            ],
                          },
                        ]}
                      />
                    ) : null}

                    {explosionData ? (
                      <Animated.View
                        style={[
                          styles.explosion,
                          {
                            left: explosionData.x - 50,
                            top: explosionData.y - 50,
                            opacity: explosionOpacity,
                            transform: [{ scale: explosionScale }],
                          },
                        ]}
                      />
                    ) : null}
                  </View>

                  <View style={styles.cannonContainer}>
                    <Animated.View
                      style={[
                        styles.cannonBarrel,
                        {
                          transform: [{ rotate: `${cannonAngle}deg` }],
                        },
                      ]}
                    />
                    <View style={styles.cannonBase} />
                  </View>
                </Animated.View>

                <Text style={styles.shooterHintText}>To'g'ri variantni tanlab o'q uzing!</Text>
              </>
            ) : (
              <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.header}>
                  <Pressable style={styles.backButton} onPress={goBackToList}>
                    <ArrowLeft size={20} color={Colors.text} />
                  </Pressable>
                  <View style={styles.headerContent}>
                    <View style={styles.headerModeRow}>
                      <Crosshair size={16} color={Colors.primary} />
                      <Text style={styles.headerModeLabel}>Shooter</Text>
                    </View>
                    <Text style={styles.headerTitle}>{deck?.title || "Shooter"}</Text>
                  </View>
                </View>

                <ResultSummary
                  title="Shooter tugadi"
                  subtitle="Natijalarni ko'ring va xatolar bo'yicha mashqni davom ettiring."
                >
                  <View style={styles.shooterMetaGrid}>
                    <View style={styles.shooterMetaCard}>
                      <Text style={styles.shooterMetaLabel}>Jami</Text>
                      <Text style={styles.shooterMetaValue}>{shooterQueue.length}</Text>
                    </View>
                    <View style={styles.shooterMetaCard}>
                      <Text style={styles.shooterMetaLabel}>To'g'ri</Text>
                      <Text style={styles.shooterMetaValue}>{shooterCorrectCount}</Text>
                    </View>
                    <View style={styles.shooterMetaCard}>
                      <Text style={styles.shooterMetaLabel}>Foiz</Text>
                      <Text style={styles.shooterMetaValue}>{shooterAccuracy}%</Text>
                    </View>
                  </View>

                  <View style={styles.resultActions}>
                    <Pressable
                      style={[
                        styles.secondaryAction,
                        shooterCorrectCount === shooterQueue.length && styles.actionDisabled,
                      ]}
                      disabled={shooterCorrectCount === shooterQueue.length}
                      onPress={restartShooterMissed}
                    >
                      <RotateCcw size={16} color={Colors.text} />
                      <Text style={styles.secondaryActionText}>Xatolar</Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() => resetShooterSession(cards)}
                    >
                      <RotateCcw size={16} color={Colors.text} />
                      <Text style={styles.secondaryActionText}>Qayta urinish</Text>
                    </Pressable>
                    <Pressable style={styles.primaryAction} onPress={goBackToList}>
                      <Text style={styles.primaryActionText}>Tugatish</Text>
                    </Pressable>
                  </View>

                  <View style={styles.answerReviewColumn}>
                    {shooterAnswers.map((item, index) => (
                      <View
                        key={`shooter-answer-${item.card._id || index}`}
                        style={styles.answerReviewCard}
                      >
                        <Text style={styles.answerReviewLabel}>
                          {index + 1}. {getPromptText(item.card)}
                        </Text>
                        <Text style={styles.answerReviewMeta}>
                          To'g'ri: {getAnswerText(item.card)}
                        </Text>
                        {!item.isCorrect ? (
                          <Text style={[styles.answerReviewMeta, styles.answerWrong]}>
                            Tanlangan: {item.selectedOption}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </ResultSummary>
              </ScrollView>
            )}
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Pressable style={styles.backButton} onPress={goBackToList}>
                <ArrowLeft size={20} color={Colors.text} />
              </Pressable>

              <View style={styles.headerContent}>
                <View style={styles.headerModeRow}>
                  <ModeIcon mode={mode} />
                  <Text style={styles.headerModeLabel}>{getModeTitle(mode)}</Text>
                </View>
                <Text style={styles.headerTitle}>{deck?.title || "Flashcards"}</Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : cards.length === 0 ? (
              <View style={styles.centerState}>
                <CircleAlert size={26} color={Colors.warning} />
                <Text style={styles.emptyTitle}>Kartalar topilmadi</Text>
                <Text style={styles.emptyDescription}>
                  Bu to'plamda ishlash uchun kamida bitta karta bo'lishi kerak.
                </Text>
              </View>
            ) : mode === "review" ? (
              <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.progressShell}>
                  <Text style={styles.progressText}>
                    {reviewCompleted
                      ? "Bugungi session tugadi"
                      : `Qolgan kartalar: ${reviewRemaining}`}
                  </Text>
                  <Text style={styles.progressSubtext}>
                    Yo'nalish: {promptSide === "front" ? "old tomondan" : "orqa tomondan"}
                  </Text>
                </View>

                {reviewCompleted ? (
                  <ResultSummary
                    title="Barakalla!"
                    subtitle="Ushbu sessiondagi kartalar tugadi. Xohlasangiz qayta ishlashni boshlashingiz mumkin."
                  >
                    <View style={styles.resultActions}>
                      <Pressable
                        style={styles.secondaryAction}
                        onPress={() => resetReviewSession(cards)}
                      >
                        <RotateCcw size={16} color={Colors.text} />
                        <Text style={styles.secondaryActionText}>Qayta ishlash</Text>
                      </Pressable>
                      <Pressable style={styles.primaryAction} onPress={goBackToList}>
                        <Text style={styles.primaryActionText}>Ro'yxatga qaytish</Text>
                      </Pressable>
                    </View>
                  </ResultSummary>
                ) : currentReviewCard ? (
                  <>
                    <StudyFace
                      imageUri={
                        reviewShowAnswer
                          ? getAnswerImage(currentReviewCard)
                          : getPromptImage(currentReviewCard)
                      }
                      text={
                        reviewShowAnswer
                          ? getAnswerText(currentReviewCard)
                          : getPromptText(currentReviewCard)
                      }
                      caption={reviewShowAnswer ? "Javob" : "Savol"}
                    />

                    {!reviewShowAnswer ? (
                      <Pressable
                        style={styles.primaryAction}
                        onPress={() => setReviewShowAnswer(true)}
                      >
                        <Text style={styles.primaryActionText}>Javobni ko'rish</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.ratingColumn}>
                        {[
                          { key: 0 as ReviewRating, title: "Topolmadim", tone: "danger" },
                          { key: 1 as ReviewRating, title: "Qiyin", tone: "warning" },
                          { key: 2 as ReviewRating, title: "Biroz qiynaldim", tone: "neutral" },
                          { key: 3 as ReviewRating, title: "Oson", tone: "success" },
                        ].map((item) => (
                          <Pressable
                            key={item.key}
                            style={[
                              styles.ratingButton,
                              item.tone === "danger"
                                ? styles.ratingDanger
                                : item.tone === "warning"
                                  ? styles.ratingWarning
                                  : item.tone === "success"
                                    ? styles.ratingSuccess
                                    : styles.ratingNeutral,
                            ]}
                            disabled={reviewSubmitting}
                            onPress={() => void handleReviewRating(item.key)}
                          >
                            <Text style={styles.ratingButtonText}>{item.title}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                ) : null}
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.progressShell}>
                  <Text style={styles.progressText}>
                    {testCompleted
                      ? `Natija: ${testCorrectCount}/${testQueue.length}`
                      : `Savol: ${testIndex + 1}/${testQueue.length}`}
                  </Text>
                  <Text style={styles.progressSubtext}>
                    Yo'nalish: {promptSide === "front" ? "old tomondan" : "orqa tomondan"}
                  </Text>
                </View>

                {testCompleted ? (
                  <ResultSummary
                    title="Test yakunlandi"
                    subtitle="Natijalarni ko'ring va kerak bo'lsa qayta ishlang."
                  >
                    <View style={styles.resultActions}>
                      <Pressable
                        style={[
                          styles.secondaryAction,
                          testCorrectCount === testQueue.length && styles.actionDisabled,
                        ]}
                        disabled={testCorrectCount === testQueue.length}
                        onPress={restartTestMissed}
                      >
                        <RotateCcw size={16} color={Colors.text} />
                        <Text style={styles.secondaryActionText}>Topilmaganlar</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryAction}
                        onPress={() => resetTestSession(cards)}
                      >
                        <RotateCcw size={16} color={Colors.text} />
                        <Text style={styles.secondaryActionText}>Barchasi</Text>
                      </Pressable>
                      <Pressable style={styles.primaryAction} onPress={goBackToList}>
                        <Text style={styles.primaryActionText}>Ro'yxatga qaytish</Text>
                      </Pressable>
                    </View>

                    <View style={styles.answerReviewColumn}>
                      {testAnswers.map((item, index) => (
                        <View
                          key={`test-answer-${item.card._id || index}`}
                          style={styles.answerReviewCard}
                        >
                          <Text style={styles.answerReviewLabel}>
                            {index + 1}. {getPromptText(item.card)}
                          </Text>
                          <Text style={styles.answerReviewMeta}>
                            To'g'ri: {getAnswerText(item.card)}
                          </Text>
                          <Text
                            style={[
                              styles.answerReviewMeta,
                              item.isCorrect ? styles.answerCorrect : styles.answerWrong,
                            ]}
                          >
                            Tanlangan: {item.selectedOption || "-"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </ResultSummary>
                ) : currentTestCard ? (
                  <>
                    <StudyFace
                      imageUri={getPromptImage(currentTestCard)}
                      text={getPromptText(currentTestCard)}
                      caption="Savol"
                    />

                    <View style={styles.optionColumn}>
                      {testOptions.map((option) => {
                        const isCorrect = option === getAnswerText(currentTestCard);
                        const isSelected = selectedTestOption === option;
                        return (
                          <Pressable
                            key={option}
                            style={[
                              styles.optionButton,
                              isSelected && isCorrect && styles.optionButtonCorrect,
                              isSelected && !isCorrect && styles.optionButtonWrong,
                            ]}
                            disabled={Boolean(selectedTestOption)}
                            onPress={() => handleTestAnswer(option)}
                          >
                            <Text style={styles.optionButtonText}>{option}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  headerContent: {
    flex: 1,
    gap: 4,
  },
  headerModeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerModeLabel: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyDescription: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  progressShell: {
    borderRadius: 22,
    backgroundColor: Colors.surfaceMuted,
    padding: 14,
    gap: 4,
  },
  progressText: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  progressSubtext: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  faceCard: {
    minHeight: 320,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  faceCaption: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  faceImage: {
    width: "100%",
    maxWidth: 280,
    height: 180,
    borderRadius: 20,
    backgroundColor: Colors.surfaceMuted,
  },
  faceText: {
    color: Colors.text,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "800",
    textAlign: "center",
  },
  primaryAction: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryActionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryAction: {
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryActionText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  resultShell: {
    gap: 16,
  },
  resultBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  resultTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  resultSubtitle: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  resultActions: {
    gap: 10,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  ratingColumn: {
    gap: 10,
  },
  ratingButton: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  ratingDanger: {
    backgroundColor: "rgba(240, 71, 71, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(240, 71, 71, 0.34)",
  },
  ratingWarning: {
    backgroundColor: "rgba(250, 166, 26, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(250, 166, 26, 0.34)",
  },
  ratingNeutral: {
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ratingSuccess: {
    backgroundColor: "rgba(67, 181, 129, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(67, 181, 129, 0.34)",
  },
  ratingButtonText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  optionColumn: {
    gap: 10,
  },
  optionButton: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  optionButtonCorrect: {
    backgroundColor: "rgba(67, 181, 129, 0.18)",
    borderColor: "rgba(67, 181, 129, 0.34)",
  },
  optionButtonWrong: {
    backgroundColor: "rgba(240, 71, 71, 0.16)",
    borderColor: "rgba(240, 71, 71, 0.34)",
  },
  optionButtonText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  answerReviewColumn: {
    gap: 10,
  },
  answerReviewCard: {
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    padding: 14,
    gap: 6,
  },
  answerReviewLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  answerReviewMeta: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  answerCorrect: {
    color: Colors.accent,
  },
  answerWrong: {
    color: Colors.danger,
  },
  classicRoot: {
    flex: 1,
    backgroundColor: "#11141B",
  },
  classicTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  classicTopButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  classicTopButtonDisabled: {
    opacity: 0.45,
  },
  classicTopCenter: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  classicTopCounter: {
    color: "#F2F3F5",
    fontSize: 18,
    fontWeight: "800",
  },
  classicTopTitle: {
    color: "#A8ADB7",
    fontSize: 13,
    fontWeight: "600",
  },
  classicProgressTrack: {
    height: 6,
    marginHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  classicProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  classicFloatingCounters: {
    position: "absolute",
    top: 85,
    left: 0,
    right: 0,
    zIndex: 40,
    pointerEvents: "none",
  },
  classicFloatingCounterLeft: {
    position: "absolute",
    left: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(67, 181, 129, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(67, 181, 129, 0.34)",
  },
  classicFloatingCounterRight: {
    position: "absolute",
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(240, 71, 71, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(240, 71, 71, 0.34)",
  },
  classicFloatingCounterText: {
    color: "#F2F3F5",
    fontSize: 18,
    fontWeight: "900",
  },
  classicViewport: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 80,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  classicStage: {
    justifyContent: "center",
    alignItems: "center",
  },
  classicStackSurface: {
    position: "absolute",
    borderRadius: 30,
    backgroundColor: "#1B202A",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  classicPreviewCard: {
    position: "absolute",
    borderRadius: 30,
    backgroundColor: "#161B24",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: 18,
  },
  classicSwipeCard: {
    position: "absolute",
    zIndex: 60,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  classicSwipeCardPressable: {
    flex: 1,
  },
  classicFlipShell: {
    flex: 1,
  },
  classicFlipLayer: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: "#171C25",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  classicCardFace: {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: "hidden",
  },
  classicCardFaceFront: {
    backgroundColor: "#171C25",
  },
  classicCardFaceBack: {
    backgroundColor: "#1E2633",
  },
  classicCardFaceMirrorFix: {
    flex: 1,
    transform: [{ scaleX: -1 }],
  },
  classicCardFaceHidden: {
    opacity: 0,
  },
  classicCardToolbar: {
    height: 54,
    paddingHorizontal: 16,
    paddingTop: 12,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  classicToolbarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  classicToolbarGhost: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  classicCardBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 26,
    gap: 18,
  },
  classicCardImage: {
    width: "100%",
    maxWidth: 280,
    height: 200,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  classicCardWord: {
    color: Colors.text,
    fontSize: 34,
    lineHeight: 48,
    fontWeight: "900",
    textAlign: "center",
    width: "100%",
    paddingVertical: 6,
  },
  classicPreviewText: {
    color: "#CBD5E1",
    fontSize: 28,
    lineHeight: 38,
    fontWeight: "800",
    textAlign: "center",
    width: "100%",
    paddingVertical: 4,
  },
  classicActionHint: {
    position: "absolute",
    top: 28,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  classicActionHintLeft: {
    left: 18,
    backgroundColor: "rgba(240, 71, 71, 0.18)",
    borderColor: "rgba(240, 71, 71, 0.34)",
  },
  classicActionHintRight: {
    right: 18,
    backgroundColor: "rgba(67, 181, 129, 0.2)",
    borderColor: "rgba(67, 181, 129, 0.36)",
  },
  classicActionHintText: {
    fontSize: 12,
    fontWeight: "900",
  },
  classicActionHintTextDanger: {
    color: "#F87171",
  },
  classicActionHintTextSuccess: {
    color: "#4ADE80",
  },
  classicHelperText: {
    color: "#A8ADB7",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  shooterRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingBottom: 12,
  },
  shooterMetaGrid: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  shooterMetaCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 4,
  },
  shooterMetaLabel: {
    color: Colors.subtleText,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  shooterMetaValue: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: "900",
  },
  shooterBoard: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(88, 101, 242, 0.22)",
    backgroundColor: "#050A14",
    overflow: "hidden",
  },
  shooterStarsLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#050A14",
    opacity: 1,
  },
  shooterPromptBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 18,
    backgroundColor: "rgba(5, 10, 20, 0.88)",
  },
  shooterPromptBarText: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "900",
    textAlign: "center",
  },
  shooterArena: {
    ...StyleSheet.absoluteFillObject,
  },
  shooterTargetWrap: {
    position: "absolute",
    minWidth: 132,
    maxWidth: 240,
  },
  shooterTarget: {
    minHeight: 64,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#152033",
    paddingHorizontal: 22,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  shooterTargetWrong: {
    backgroundColor: "rgba(127, 29, 29, 0.96)",
    borderColor: "#EF4444",
  },
  shooterTargetHidden: {
    opacity: 0,
  },
  shooterTargetText: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  projectile: {
    position: "absolute",
    width: 12,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#10B981",
    shadowColor: "#10B981",
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  explosion: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#F59E0B",
  },
  cannonContainer: {
    position: "absolute",
    left: "50%",
    bottom: 0,
    width: 140,
    height: 140,
    marginLeft: -70,
    zIndex: 12,
  },
  cannonBarrel: {
    position: "absolute",
    left: 58,
    bottom: 10,
    width: 24,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#64748B",
    transformOrigin: "center 70px",
  },
  cannonBase: {
    position: "absolute",
    left: 20,
    bottom: -20,
    width: 100,
    height: 60,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
    backgroundColor: "#1E293B",
  },
  shooterHintText: {
    marginTop: 10,
    color: Colors.subtleText,
    fontSize: 13,
    textAlign: "center",
  },
});
