import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  BookOpenText,
  Eye,
  Globe,
  Layers3,
  Link2,
  Lock,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { APP_LIMITS, getTierLimit } from "../../constants/appLimits";
import { APP_BASE_URL } from "../../config/env";
import { arenaApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type {
  ArenaFlashcardDeck,
  ArenaFlashcardMember,
  ArenaFlashcardPromptSide,
  ArenaFlashcardStudyMode,
  ArenaFlashcardUserRef,
} from "../../types/arena";
import { getEntityId } from "../../utils/chat";
import { ArenaFlashcardEditorSheet } from "./ArenaFlashcardEditorSheet";

type Props = NativeStackScreenProps<RootStackParamList, "ArenaFlashcardList">;
type DeckMenuState = {
  deck: ArenaFlashcardDeck;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PreviewSheetProps = {
  visible: boolean;
  deck: ArenaFlashcardDeck | null;
  loading: boolean;
  currentUserId: string;
  joining: boolean;
  leaving: boolean;
  onClose: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onStart: () => void;
};

type TrainingSheetProps = {
  visible: boolean;
  deck: ArenaFlashcardDeck | null;
  promptSide: ArenaFlashcardPromptSide;
  onClose: () => void;
  onPromptSideChange: (value: ArenaFlashcardPromptSide) => void;
  onStart: (mode: ArenaFlashcardStudyMode) => void;
};

const FLOATING_MENU_WIDTH = 190;
const FLOATING_MENU_HEIGHT = 176;
const PROMPT_SIDE_STORAGE_KEY = "jamm-flashcard-prompt-side-v1";

function getUserRefId(value?: ArenaFlashcardUserRef | null) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return getEntityId(value);
}

function getUserRefName(value?: ArenaFlashcardUserRef | null) {
  if (!value) {
    return "Noma'lum";
  }

  if (typeof value === "string") {
    return value;
  }

  return value.nickname || value.name || value.username || "Noma'lum";
}

function getDeckIdentifier(deck?: ArenaFlashcardDeck | null) {
  return String(deck?.urlSlug || deck?._id || "");
}

function getDeckCardCount(deck?: ArenaFlashcardDeck | null) {
  return Array.isArray(deck?.cards) ? deck.cards.length : 0;
}

function getDeckCover(deck?: ArenaFlashcardDeck | null) {
  if (!deck || !Array.isArray(deck.cards)) {
    return "";
  }

  for (const card of deck.cards) {
    const candidate = String(card.frontImage || card.backImage || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function isDeckOwner(deck: ArenaFlashcardDeck | null, currentUserId: string) {
  return Boolean(currentUserId && getUserRefId(deck?.createdBy) === currentUserId);
}

function isDeckJoined(deck: ArenaFlashcardDeck | null, currentUserId: string) {
  if (!deck || !currentUserId || !Array.isArray(deck.members)) {
    return false;
  }

  return deck.members.some((member) => getUserRefId(member.userId) === currentUserId);
}

function getDeckMembers(deck?: ArenaFlashcardDeck | null) {
  const list: Array<{
    id: string;
    label: string;
    avatar?: string | null;
    secondary: string;
  }> = [];
  const ownerId = getUserRefId(deck?.createdBy);

  if (deck?.createdBy) {
    const owner =
      typeof deck.createdBy === "string" ? null : deck.createdBy;
    list.push({
      id: ownerId || "owner",
      label: getUserRefName(deck.createdBy),
      avatar: owner?.avatar || null,
      secondary: "Tuzuvchi",
    });
  }

  if (Array.isArray(deck?.members)) {
    deck.members.forEach((member: ArenaFlashcardMember, index) => {
      const memberId = getUserRefId(member.userId) || `member-${index}`;
      if (memberId === ownerId) {
        return;
      }

      const user = member.userId && typeof member.userId !== "string" ? member.userId : null;
      list.push({
        id: memberId,
        label: getUserRefName(member.userId),
        avatar: user?.avatar || null,
        secondary: member.joinedAt
          ? `${new Date(member.joinedAt).toLocaleDateString("uz-UZ")} qo'shilgan`
          : "A'zo",
      });
    });
  }

  return list;
}

function FlashcardDeckPreviewSheet({
  visible,
  deck,
  loading,
  currentUserId,
  joining,
  leaving,
  onClose,
  onJoin,
  onLeave,
  onStart,
}: PreviewSheetProps) {
  const ownDeck = isDeckOwner(deck, currentUserId);
  const joined = isDeckJoined(deck, currentUserId);
  const members = useMemo(() => getDeckMembers(deck), [deck]);

  const footer = (
    <View style={styles.sheetFooterRow}>
      {!ownDeck ? (
        joined ? (
          <Pressable
            style={[styles.footerSecondaryButton, leaving && styles.footerButtonDisabled]}
            disabled={leaving}
            onPress={onLeave}
          >
            {leaving ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={styles.footerSecondaryButtonText}>Lugatdan chiqish</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.footerSecondaryButton, joining && styles.footerButtonDisabled]}
            disabled={joining}
            onPress={onJoin}
          >
            {joining ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={styles.footerSecondaryButtonText}>Qo'shilish</Text>
            )}
          </Pressable>
        )
      ) : (
        <View style={styles.footerSecondaryPlaceholder} />
      )}
      <Pressable
        style={[styles.footerPrimaryButton, (!deck || loading) && styles.footerButtonDisabled]}
        disabled={!deck || loading}
        onPress={onStart}
      >
        <Text style={styles.footerPrimaryButtonText}>Mashqni boshlash</Text>
      </Pressable>
    </View>
  );

  return (
    <DraggableBottomSheet
      visible={visible}
      title={deck?.title?.trim() || "Flashcards"}
      onClose={onClose}
      footer={footer}
      minHeight={620}
      initialHeightRatio={0.9}
      maxHeightRatio={0.97}
    >
      {loading ? (
        <View style={styles.sheetCenterState}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : !deck ? (
        <View style={styles.sheetCenterState}>
          <Text style={styles.stateTitle}>Lugat topilmadi</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.previewHero}>
            {getDeckCover(deck) ? (
              <Image
                source={{ uri: getDeckCover(deck) }}
                style={styles.previewHeroImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.previewHeroPlaceholder}>
                <Layers3 size={28} color={Colors.primary} />
              </View>
            )}

            <View style={styles.previewHeroInfo}>
              <Text style={styles.previewHeroTitle}>{deck.title || "Flashcards"}</Text>
              <Text style={styles.previewHeroMeta}>
                {getDeckCardCount(deck)} ta karta
              </Text>
              <Text style={styles.previewHeroMeta}>
                Muallif: {getUserRefName(deck.createdBy)}
              </Text>
            </View>
          </View>

          <View style={styles.previewStatsRow}>
            <View style={styles.previewStat}>
              <Text style={styles.previewStatLabel}>Holat</Text>
              <Text style={styles.previewStatValue}>
                {deck.isPublic !== false ? "Ochiq" : "Yopiq"}
              </Text>
            </View>
            <View style={styles.previewStat}>
              <Text style={styles.previewStatLabel}>A'zolar</Text>
              <Text style={styles.previewStatValue}>{members.length}</Text>
            </View>
            <View style={styles.previewStat}>
              <Text style={styles.previewStatLabel}>Siz</Text>
              <Text style={styles.previewStatValue}>
                {ownDeck ? "Tuzuvchi" : joined ? "A'zo" : "Mehmon"}
              </Text>
            </View>
          </View>

          <View style={styles.previewSection}>
            <Text style={styles.previewSectionTitle}>A'zolar</Text>
            {members.length > 0 ? (
              members.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    {member.avatar ? (
                      <Image
                        source={{ uri: member.avatar }}
                        style={styles.memberAvatarImage}
                        contentFit="cover"
                      />
                    ) : (
                      <Text style={styles.memberAvatarText}>
                        {(member.label || "?").slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.memberContent}>
                    <Text style={styles.memberName}>{member.label}</Text>
                    <Text style={styles.memberSecondary}>{member.secondary}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.sectionEmptyText}>Hozircha a'zolar yo'q.</Text>
            )}
          </View>

          <View style={styles.previewSection}>
            <Text style={styles.previewSectionTitle}>Kartalar</Text>
            {Array.isArray(deck.cards) && deck.cards.length > 0 ? (
              deck.cards.map((card, index) => (
                <View
                  key={String(card._id || `preview-card-${index}`)}
                  style={styles.previewCardRow}
                >
                  <View style={styles.previewCardTextColumn}>
                    <Text style={styles.previewCardLabel}>Old tomoni</Text>
                    <Text style={styles.previewCardText}>{card.front || "-"}</Text>
                    <Text style={styles.previewCardLabel}>Orqa tomoni</Text>
                    <Text style={styles.previewCardText}>{card.back || "-"}</Text>
                  </View>
                  {card.frontImage || card.backImage ? (
                    <Image
                      source={{ uri: String(card.frontImage || card.backImage) }}
                      style={styles.previewCardImage}
                      contentFit="cover"
                    />
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.sectionEmptyText}>Kartalar topilmadi.</Text>
            )}
          </View>
        </ScrollView>
      )}
    </DraggableBottomSheet>
  );
}

function FlashcardTrainingSheet({
  visible,
  deck,
  promptSide,
  onClose,
  onPromptSideChange,
  onStart,
}: TrainingSheetProps) {
  const modeCards: Array<{
    key: ArenaFlashcardStudyMode;
    title: string;
    description: string;
    icon: typeof Sparkles;
  }> = [
    {
      key: "review",
      title: "Eslab qolish",
      description:
        promptSide === "front"
          ? "Old tomoni ko'rinadi, javobni baholab davom etasiz."
          : "Orqa tomoni ko'rinadi, old tomonni eslab baholaysiz.",
      icon: Sparkles,
    },
    {
      key: "classic",
      title: "Flashcards",
      description:
        promptSide === "front"
          ? "Kartani ochib, bilganingizni yoki topolmaganingizni belgilang."
          : "Teskari yo'nalishda flip kartalar bilan ishlaysiz.",
      icon: Layers3,
    },
    {
      key: "test",
      title: "Test mashqi",
      description:
        promptSide === "front"
          ? "Savolga mos orqa tomonni variantlardan topasiz."
          : "Orqa tomonga mos old tomonni tanlaysiz.",
      icon: BookOpenText,
    },
    {
      key: "shooter",
      title: "Shooter",
      description:
        promptSide === "front"
          ? "Tezkor target rejimida to'g'ri javobga tegib ball yig'asiz."
          : "Teskari target rejimida javoblarni tez tanlaysiz.",
      icon: Rocket,
    },
  ];

  return (
    <DraggableBottomSheet
      visible={visible}
      title={deck?.title?.trim() || "Mashq turini tanlang"}
      onClose={onClose}
      minHeight={560}
      initialHeightRatio={0.82}
      maxHeightRatio={0.94}
    >
      <ScrollView contentContainerStyle={styles.sheetContent}>
        <View style={styles.trainingHeader}>
          <Text style={styles.trainingTitle}>Qaysi tomoni so'ralsin?</Text>
          <Text style={styles.trainingSubtitle}>
            Tanlangan yo'nalish barcha mashq turlarida ishlaydi.
          </Text>
        </View>

        <View style={styles.promptSideRow}>
          <Pressable
            style={[
              styles.promptSideButton,
              promptSide === "front" && styles.promptSideButtonActive,
            ]}
            onPress={() => onPromptSideChange("front")}
          >
            <Text
              style={[
                styles.promptSideText,
                promptSide === "front" && styles.promptSideTextActive,
              ]}
            >
              Old tomoni
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.promptSideButton,
              promptSide === "back" && styles.promptSideButtonActive,
            ]}
            onPress={() => onPromptSideChange("back")}
          >
            <Text
              style={[
                styles.promptSideText,
                promptSide === "back" && styles.promptSideTextActive,
              ]}
            >
              Orqa tomoni
            </Text>
          </Pressable>
        </View>

        <View style={styles.modeCardColumn}>
          {modeCards.map((mode) => {
            const Icon = mode.icon;
            return (
              <Pressable
                key={mode.key}
                style={styles.modeCard}
                onPress={() => onStart(mode.key)}
              >
                <View style={styles.modeCardIconWrap}>
                  <Icon size={20} color={Colors.primary} />
                </View>
                <View style={styles.modeCardContent}>
                  <Text style={styles.modeCardTitle}>{mode.title}</Text>
                  <Text style={styles.modeCardDescription}>{mode.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </DraggableBottomSheet>
  );
}

export function ArenaFlashcardListScreen({ navigation, route }: Props) {
  const user = useAuthStore((state) => state.user);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const currentUserId = String(user?._id || user?.id || "");
  const deckLimit = getTierLimit(APP_LIMITS.flashcardsCreated, user?.premiumStatus);
  const menuButtonRefs = useRef<Record<string, View | null>>({});
  const [decks, setDecks] = useState<ArenaFlashcardDeck[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menuState, setMenuState] = useState<DeckMenuState | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingDeck, setEditingDeck] = useState<ArenaFlashcardDeck | null>(null);
  const [detailDeck, setDetailDeck] = useState<ArenaFlashcardDeck | null>(null);
  const [detailMode, setDetailMode] = useState<"preview" | "training" | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailActionDeckId, setDetailActionDeckId] = useState<string | null>(null);
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [promptSide, setPromptSide] = useState<ArenaFlashcardPromptSide>("front");

  const myDeckCount = useMemo(
    () => decks.filter((deck) => isDeckOwner(deck, currentUserId)).length,
    [currentUserId, decks],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(PROMPT_SIDE_STORAGE_KEY);
        if (!active) {
          return;
        }
        setPromptSide(stored === "back" ? "back" : "front");
      } catch {
        if (active) {
          setPromptSide("front");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(PROMPT_SIDE_STORAGE_KEY, promptSide);
  }, [promptSide]);

  const mergeDecks = (current: ArenaFlashcardDeck[], incoming: ArenaFlashcardDeck[]) => {
    const nextMap = new Map<string, ArenaFlashcardDeck>();
    [...current, ...incoming].forEach((deck, index) => {
      const key = String(deck._id || deck.urlSlug || `deck-${index}`);
      nextMap.set(key, deck);
    });
    return Array.from(nextMap.values());
  };

  const loadDecks = async (
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
      const payload = await arenaApi.fetchFlashcards(nextPage, APP_LIMITS.flashcardDeckPageSize);
      const items = Array.isArray(payload.data) ? payload.data : [];

      setDecks((prev) => (replace ? items : mergeDecks(prev, items)));
      setPage(Number(payload.page || nextPage));
      setHasMore(Number(payload.page || nextPage) < Number(payload.totalPages || 1));
    } catch (error) {
      if (!silent) {
        Alert.alert(
          "Flashcards yuklanmadi",
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
  };

  const loadDeckDetail = async (deckId: string, mode: "preview" | "training") => {
    setDetailLoading(true);
    setDetailMode(mode);
    try {
      const payload = await arenaApi.fetchFlashcardDeck(deckId);
      setDetailDeck(payload);
    } catch (error) {
      setDetailMode(null);
      setDetailDeck(null);
      Alert.alert(
        "Lugat ochilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadDecks(1, { replace: true });

    const unsubscribe = navigation.addListener("focus", () => {
      void loadDecks(1, { replace: true, silent: false });
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const deckId = String(route.params?.deckId || "");
    if (!deckId) {
      return;
    }

    void loadDeckDetail(deckId, "preview");
  }, [route.params?.deckId]);

  const handleBack = () => {
    if (Platform.OS === "web") {
      navigation.navigate("MainTabs", { screen: "Courses" });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("MainTabs", { screen: "Courses" });
  };

  const handleCopyLink = async (deck: ArenaFlashcardDeck) => {
    setMenuState(null);
    const identifier = getDeckIdentifier(deck);
    if (!identifier) {
      Alert.alert("Havola tayyor emas", "Bu lugat uchun havola hali mavjud emas.");
      return;
    }

    await Clipboard.setStringAsync(`${APP_BASE_URL}/arena/flashcards/${identifier}`);
    Alert.alert("Nusxalandi", "Lugat havolasi clipboard'ga saqlandi.");
  };

  const handleOpenCreate = () => {
    if (myDeckCount >= deckLimit) {
      Alert.alert(
        "Limitga yetildi",
        `Siz maksimal ${deckLimit} ta flashcard to'plami yarata olasiz.`,
      );
      return;
    }

    setEditingDeck(null);
    setEditorVisible(true);
  };

  const handleOpenTraining = async (deck: ArenaFlashcardDeck) => {
    if (!deck._id) {
      Alert.alert("Lugat topilmadi", "Bu to'plamni ochib bo'lmadi.");
      return;
    }

    setMenuState(null);
    void loadDeckDetail(String(deck._id), "training");
  };

  const handleOpenPreview = async (deck: ArenaFlashcardDeck) => {
    if (!deck._id) {
      Alert.alert("Lugat topilmadi", "Bu to'plamni ochib bo'lmadi.");
      return;
    }

    setMenuState(null);
    void loadDeckDetail(String(deck._id), "preview");
  };

  const openMenu = (deck: ArenaFlashcardDeck) => {
    const deckId = String(deck._id || "");
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

  const handleDeleteDeck = (deck: ArenaFlashcardDeck) => {
    if (!deck._id || deletingDeckId) {
      return;
    }

    Alert.alert(
      "Lugatni o'chirasizmi?",
      "Bu amal kartalar va progresslarni ham o'chiradi.",
      [
        {
          text: "Bekor qilish",
          style: "cancel",
        },
        {
          text: "O'chirish",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingDeckId(String(deck._id));
              try {
                await arenaApi.deleteFlashcardDeck(String(deck._id));
                if (detailDeck?._id === deck._id) {
                  setDetailDeck(null);
                  setDetailMode(null);
                }
                setMenuState(null);
                await loadDecks(1, { replace: true, silent: true });
              } catch (error) {
                Alert.alert(
                  "Lugat o'chirilmadi",
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

  const handleJoinDeck = async () => {
    const deckId = String(detailDeck?._id || "");
    if (!deckId || detailActionDeckId) {
      return;
    }

    setDetailActionDeckId(deckId);
    try {
      await arenaApi.joinFlashcardDeck(deckId);
      const updatedDeck = await arenaApi.fetchFlashcardDeck(deckId);
      setDetailDeck(updatedDeck);
      await loadDecks(1, { replace: true, silent: true });
    } catch (error) {
      Alert.alert(
        "Qo'shilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setDetailActionDeckId(null);
    }
  };

  const handleLeaveDeck = async () => {
    const deckId = String(detailDeck?._id || "");
    if (!deckId || detailActionDeckId) {
      return;
    }

    Alert.alert(
      "Lugatdan chiqasizmi?",
      "Progressingiz ham o'chib ketadi.",
      [
        {
          text: "Bekor qilish",
          style: "cancel",
        },
        {
          text: "Chiqish",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDetailActionDeckId(deckId);
              try {
                await arenaApi.leaveFlashcardDeck(deckId);
                setDetailDeck(null);
                setDetailMode(null);
                await loadDecks(1, { replace: true, silent: true });
              } catch (error) {
                Alert.alert(
                  "Chiqib bo'lmadi",
                  error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
                );
              } finally {
                setDetailActionDeckId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const handleStartFromPreview = () => {
    if (!detailDeck) {
      return;
    }

    setDetailMode("training");
  };

  const handleStartMode = (mode: ArenaFlashcardStudyMode) => {
    const deckId = String(detailDeck?._id || "");
    if (!deckId || !detailDeck) {
      return;
    }

    const payloadDeck = {
      ...detailDeck,
      cards: Array.isArray(detailDeck.cards) ? detailDeck.cards : [],
    };

    setDetailMode(null);
    setDetailDeck(null);
    navigation.navigate("ArenaFlashcardStudy", {
      deckId,
      deck: payloadDeck,
      mode,
      promptSide,
    });
  };

  const handleLoadMore = () => {
    if (!hasMore || loadingMore || initialLoading) {
      return;
    }

    void loadDecks(page + 1);
  };

  const activeMenuDeck = menuState?.deck || null;
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

  const renderDeckCard = ({ item }: { item: ArenaFlashcardDeck }) => {
    const deckId = String(item._id || "");
    const owner = isDeckOwner(item, currentUserId);
    const creator = getUserRefName(item.createdBy);
    const isDeleting = deletingDeckId === deckId;
    const previewImage = getDeckCover(item);

    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          if (menuState?.deck._id === item._id) {
            setMenuState(null);
            return;
          }

          void handleOpenTraining(item);
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
              {isDeleting ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <MoreHorizontal size={18} color={Colors.text} />
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.coverWrap}>
            {previewImage ? (
              <Image source={{ uri: previewImage }} style={styles.coverImage} contentFit="cover" />
            ) : (
              <View style={styles.coverFallback}>
                <Layers3 size={24} color={Colors.primary} />
              </View>
            )}
          </View>

          <View style={styles.cardMetaColumn}>
            <Text style={styles.cardMetaText}>{getDeckCardCount(item)} ta karta</Text>
            <Text style={styles.cardMetaText}>Muallif: {creator}</Text>
            <Text style={styles.cardMetaText}>
              A'zolar: {getDeckMembers(item).length}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.startHint}>
            <PlayCircle size={14} color={Colors.mutedText} />
            <Text style={styles.startHintText}>Boshlash uchun kartani bosing</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerSlot}>
            <Pressable style={styles.headerButton} onPress={handleBack}>
              <ArrowLeft size={20} color={Colors.text} />
            </Pressable>
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Flashcards</Text>
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
            keyExtractor={(item, index) => String(item._id || item.urlSlug || `deck-${index}`)}
            renderItem={renderDeckCard}
            contentContainerStyle={[
              styles.listContent,
              decks.length === 0 && styles.listContentEmpty,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void loadDecks(1, { replace: true })}
                tintColor={Colors.primary}
              />
            }
            onEndReachedThreshold={0.3}
            onEndReached={handleLoadMore}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyOrb}>
                  <Layers3 size={28} color={Colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>Flashcard to'plamlari yo'q</Text>
                <Text style={styles.emptyDescription}>
                  Yangi to'plam yarating va mobil ichida barcha mashqlarni ishlang.
                </Text>
                <Pressable style={styles.emptyAction} onPress={handleOpenCreate}>
                  <Plus size={16} color="#fff" />
                  <Text style={styles.emptyActionText}>To'plam yaratish</Text>
                </Pressable>
              </View>
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : null
            }
          />
        )}

        <Modal
          visible={Boolean(menuState)}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuState(null)}
        >
          <Pressable style={styles.menuModalRoot} onPress={() => setMenuState(null)}>
            {activeMenuDeck ? (
              <Pressable
                style={[styles.menuDropdown, { left: menuLeft, top: menuTop }]}
                onPress={(event) => event.stopPropagation()}
              >
                <Pressable
                  style={styles.menuItem}
                  onPress={() => void handleOpenPreview(activeMenuDeck)}
                >
                  <Eye size={15} color={Colors.text} />
                  <Text style={styles.menuItemText}>Ko'rish</Text>
                </Pressable>

                <Pressable
                  style={styles.menuItem}
                  onPress={() => void handleCopyLink(activeMenuDeck)}
                >
                  <Link2 size={15} color={Colors.text} />
                  <Text style={styles.menuItemText}>Havolani nusxalash</Text>
                </Pressable>

                {isDeckOwner(activeMenuDeck, currentUserId) ? (
                  <>
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        setMenuState(null);
                        setEditingDeck(activeMenuDeck);
                        setEditorVisible(true);
                      }}
                    >
                      <Pencil size={15} color={Colors.text} />
                      <Text style={styles.menuItemText}>Tahrirlash</Text>
                    </Pressable>

                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        setMenuState(null);
                        handleDeleteDeck(activeMenuDeck);
                      }}
                    >
                      <Trash2 size={15} color={Colors.danger} />
                      <Text style={[styles.menuItemText, styles.menuItemDangerText]}>
                        O'chirish
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={styles.menuItem}
                    onPress={() => {
                      setMenuState(null);
                      void handleOpenPreview(activeMenuDeck);
                    }}
                  >
                    <Users size={15} color={Colors.text} />
                    <Text style={styles.menuItemText}>A'zolar va info</Text>
                  </Pressable>
                )}
              </Pressable>
            ) : null}
          </Pressable>
        </Modal>

        <FlashcardDeckPreviewSheet
          visible={detailMode === "preview"}
          deck={detailDeck}
          loading={detailLoading}
          currentUserId={currentUserId}
          joining={Boolean(detailActionDeckId && detailActionDeckId === String(detailDeck?._id || ""))}
          leaving={Boolean(detailActionDeckId && detailActionDeckId === String(detailDeck?._id || ""))}
          onClose={() => {
            setDetailMode(null);
            setDetailDeck(null);
          }}
          onJoin={() => void handleJoinDeck()}
          onLeave={() => void handleLeaveDeck()}
          onStart={handleStartFromPreview}
        />

        <FlashcardTrainingSheet
          visible={detailMode === "training"}
          deck={detailDeck}
          promptSide={promptSide}
          onClose={() => {
            setDetailMode(null);
            setDetailDeck(null);
          }}
          onPromptSideChange={setPromptSide}
          onStart={handleStartMode}
        />

        <ArenaFlashcardEditorSheet
          visible={editorVisible}
          deck={editingDeck}
          onClose={() => {
            setEditorVisible(false);
            setEditingDeck(null);
          }}
          onSaved={async () => {
            await loadDecks(1, { replace: true, silent: true });
          }}
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
  root: {
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
  },
  headerSlot: {
    position: "absolute",
    left: 20,
    top: 10,
    minWidth: 40,
    alignItems: "flex-start",
  },
  headerSlotEnd: {
    left: undefined,
    right: 20,
    alignItems: "flex-end",
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  headerCenter: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  headerCount: {
    color: Colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    gap: 14,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 14,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitleColumn: {
    flex: 1,
    gap: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  badgePrimary: {
    backgroundColor: Colors.primarySoft,
  },
  badgeMuted: {
    backgroundColor: Colors.surfaceMuted,
  },
  badgeText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  badgeTextPrimary: {
    color: Colors.primary,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  cardBody: {
    flexDirection: "row",
    gap: 14,
  },
  coverWrap: {
    width: 82,
    height: 82,
  },
  coverImage: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    backgroundColor: Colors.surfaceMuted,
  },
  coverFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMetaColumn: {
    flex: 1,
    justifyContent: "center",
    gap: 6,
  },
  cardMetaText: {
    color: Colors.mutedText,
    fontSize: 14,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  startHint: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  startHintText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  emptyOrb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyDescription: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  emptyAction: {
    marginTop: 8,
    height: 46,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyActionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: "center",
  },
  menuModalRoot: {
    flex: 1,
  },
  menuDropdown: {
    position: "absolute",
    width: FLOATING_MENU_WIDTH,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  menuItem: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  menuItemText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  menuItemDangerText: {
    color: Colors.danger,
  },
  sheetCenterState: {
    flex: 1,
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sheetContent: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 18,
  },
  previewHero: {
    flexDirection: "row",
    gap: 14,
    borderRadius: 22,
    backgroundColor: Colors.surfaceMuted,
    padding: 14,
  },
  previewHeroImage: {
    width: 92,
    height: 92,
    borderRadius: 20,
  },
  previewHeroPlaceholder: {
    width: 92,
    height: 92,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  previewHeroInfo: {
    flex: 1,
    justifyContent: "center",
    gap: 6,
  },
  previewHeroTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  previewHeroMeta: {
    color: Colors.mutedText,
    fontSize: 14,
  },
  previewStatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  previewStat: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    padding: 12,
    gap: 4,
  },
  previewStatLabel: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "700",
  },
  previewStatValue: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  previewSection: {
    gap: 12,
  },
  previewSectionTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    padding: 12,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  memberAvatarImage: {
    width: "100%",
    height: "100%",
  },
  memberAvatarText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  memberContent: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  memberSecondary: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  previewCardRow: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    padding: 12,
  },
  previewCardTextColumn: {
    flex: 1,
    gap: 6,
  },
  previewCardLabel: {
    color: Colors.subtleText,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  previewCardText: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  previewCardImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: Colors.surface,
  },
  sectionEmptyText: {
    color: Colors.subtleText,
    fontSize: 13,
  },
  sheetFooterRow: {
    flexDirection: "row",
    gap: 12,
  },
  footerSecondaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  footerSecondaryPlaceholder: {
    flex: 1,
  },
  footerSecondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  footerPrimaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  footerPrimaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  footerButtonDisabled: {
    opacity: 0.7,
  },
  trainingHeader: {
    gap: 6,
  },
  trainingTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  trainingSubtitle: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  promptSideRow: {
    flexDirection: "row",
    gap: 10,
  },
  promptSideButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  promptSideButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  promptSideText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  promptSideTextActive: {
    color: "#fff",
  },
  modeCardColumn: {
    gap: 12,
  },
  modeCard: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    padding: 14,
  },
  modeCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  modeCardContent: {
    flex: 1,
    gap: 4,
  },
  modeCardTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  modeCardDescription: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
});
