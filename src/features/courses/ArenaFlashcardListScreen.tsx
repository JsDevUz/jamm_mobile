import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
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
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  BookOpenText,
  FolderOpen,
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
import { TextInput } from "../../components/TextInput";
import { APP_LIMITS, getTierLimit } from "../../constants/appLimits";
import { APP_BASE_URL } from "../../config/env";
import { arenaApi } from "../../lib/api";
import {
  getFlashcardDeckCache,
  loadFlashcardDeckListCache,
  removeFlashcardDeckCache,
  replaceFlashcardDeckListCache,
  upsertFlashcardDeckCache,
} from "../../lib/flashcard-cache";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type {
  ArenaFlashcardDeck,
  ArenaFlashcardFolder,
  ArenaFlashcardMember,
  ArenaFlashcardFolderMember,
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

type FolderPreviewSheetProps = {
  visible: boolean;
  folder: ArenaFlashcardFolder | null;
  loading: boolean;
  currentUserId: string;
  joining: boolean;
  leaving: boolean;
  onClose: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onCopyLink: () => void;
  onOpenDeck: (deck: ArenaFlashcardDeck) => void;
  onEdit: () => void;
  onDelete: () => void;
};

type FolderEditorSheetProps = {
  visible: boolean;
  folder: ArenaFlashcardFolder | null;
  saving: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
};

const FLOATING_MENU_WIDTH = 190;
const FLOATING_MENU_HEIGHT = 176;
const PROMPT_SIDE_STORAGE_KEY = "jamm-flashcard-prompt-side-v1";
const NO_FOLDER_FILTER_ID = "__no-folder__";

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

function getFolderIdentifier(folder?: ArenaFlashcardFolder | null) {
  return String(folder?.urlSlug || folder?._id || "");
}

function getFolderIdentifierCandidates(folder?: ArenaFlashcardFolder | null) {
  const candidates = [folder?.urlSlug, folder?._id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

function getDeckFolderIdentifier(deck?: ArenaFlashcardDeck | null) {
  if (!deck?.folderId) {
    return "";
  }

  if (typeof deck.folderId === "string") {
    return String(deck.folderId);
  }

  return String(deck.folderId.urlSlug || deck.folderId._id || deck.folderId.id || "");
}

function getDeckFolderIdentifierCandidates(deck?: ArenaFlashcardDeck | null) {
  if (!deck?.folderId) {
    return [];
  }

  if (typeof deck.folderId === "string") {
    const identifier = String(deck.folderId).trim();
    return identifier ? [identifier] : [];
  }

  const candidates = [deck.folderId.urlSlug, deck.folderId._id, deck.folderId.id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return Array.from(new Set(candidates));
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

function isFolderOwner(folder: ArenaFlashcardFolder | null, currentUserId: string) {
  return Boolean(currentUserId && getUserRefId(folder?.createdBy) === currentUserId);
}

function isFolderJoined(folder: ArenaFlashcardFolder | null, currentUserId: string) {
  if (!folder || !currentUserId || !Array.isArray(folder.members)) {
    return false;
  }

  return folder.members.some((member) => getUserRefId(member.userId) === currentUserId);
}

function getFolderMembers(folder?: ArenaFlashcardFolder | null) {
  const list: Array<{
    id: string;
    label: string;
    avatar?: string | null;
    secondary: string;
  }> = [];
  const ownerId = getUserRefId(folder?.createdBy);

  if (folder?.createdBy) {
    const owner =
      typeof folder.createdBy === "string" ? null : folder.createdBy;
    list.push({
      id: ownerId || "owner",
      label: getUserRefName(folder.createdBy),
      avatar: owner?.avatar || null,
      secondary: "Tuzuvchi",
    });
  }

  if (Array.isArray(folder?.members)) {
    folder.members.forEach((member: ArenaFlashcardFolderMember, index) => {
      const memberId = getUserRefId(member.userId) || `folder-member-${index}`;
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

function mergeFlashcardDecks(
  current: ArenaFlashcardDeck[],
  incoming: ArenaFlashcardDeck[],
) {
  const nextMap = new Map<string, ArenaFlashcardDeck>();
  [...current, ...incoming].forEach((deck, index) => {
    const key = String(deck._id || deck.urlSlug || `deck-${index}`);
    nextMap.set(key, deck);
  });
  return Array.from(nextMap.values());
}

function mergeFlashcardFolders(
  current: ArenaFlashcardFolder[],
  incoming: ArenaFlashcardFolder[],
) {
  const nextMap = new Map<string, ArenaFlashcardFolder>();
  [...current, ...incoming].forEach((folder, index) => {
    const key = String(folder._id || folder.urlSlug || `folder-${index}`);
    nextMap.set(key, folder);
  });
  return Array.from(nextMap.values());
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
    <View style={styles.sheetFooterSafeArea}>
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
                onPress={() =>
                  {console.log('fgdf',mode),
                  
                  onStart(mode.key)}}
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

function FlashcardFolderPreviewSheet({
  visible,
  folder,
  loading,
  currentUserId,
  joining,
  leaving,
  onClose,
  onJoin,
  onLeave,
  onCopyLink,
  onOpenDeck,
  onEdit,
  onDelete,
}: FolderPreviewSheetProps) {
  const ownFolder = isFolderOwner(folder, currentUserId);
  const joined = isFolderJoined(folder, currentUserId);
  const members = useMemo(() => getFolderMembers(folder), [folder]);
  const decks = Array.isArray(folder?.decks) ? folder.decks : [];
  const prefersExpandedSheet = !ownFolder && !joined;
  const canRenderFooter = Boolean(folder) && !loading;

  const footer = !canRenderFooter ? null : !ownFolder && !joined ? (
    <View style={styles.sheetFooterSafeArea}>
      <View style={styles.sheetFooterRow}>
        <Pressable style={styles.footerSecondaryButton} onPress={onCopyLink}>
          <Text style={styles.footerSecondaryButtonText}>Havolani nusxalash</Text>
        </Pressable>
        <Pressable
          style={[styles.footerPrimaryButton, joining && styles.footerButtonDisabled]}
          disabled={joining}
          onPress={onJoin}
        >
          {joining ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.footerPrimaryButtonText}>Yuklab olish</Text>
          )}
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={styles.sheetFooterSafeArea}>
      <View style={styles.sheetFooterRow}>
        {!ownFolder ? (
          <Pressable
            style={[styles.footerSecondaryButton, leaving && styles.footerButtonDisabled]}
            disabled={leaving}
            onPress={onLeave}
          >
            {leaving ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <Text style={styles.footerSecondaryButtonText}>Folderdan chiqish</Text>
            )}
          </Pressable>
        ) : (
          <Pressable style={styles.footerSecondaryButton} onPress={onEdit}>
            <Text style={styles.footerSecondaryButtonText}>Tahrirlash</Text>
          </Pressable>
        )}
        <Pressable style={styles.footerPrimaryButton} onPress={onCopyLink}>
          <Text style={styles.footerPrimaryButtonText}>Havolani nusxalash</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <DraggableBottomSheet
      visible={visible}
      title={folder?.title?.trim() || "Flashcard folder"}
      onClose={onClose}
      footer={footer}
      minHeight={prefersExpandedSheet ? 700 : 520}
      initialHeightRatio={prefersExpandedSheet ? 0.97 : 0.8}
      maxHeightRatio={prefersExpandedSheet ? 0.97 : 0.94}
    >
      <ScrollView
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.sheetLoading}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <>
            <View style={styles.previewStatsRow}>
              <View style={styles.previewStatCard}>
                <FolderOpen size={16} color={Colors.primary} />
                <Text style={styles.previewStatValue}>{decks.length}</Text>
                <Text style={styles.previewStatLabel}>To'plam</Text>
              </View>
              <View style={styles.previewStatCard}>
                <Users size={16} color={Colors.primary} />
                <Text style={styles.previewStatValue}>{members.length}</Text>
                <Text style={styles.previewStatLabel}>A'zo</Text>
              </View>
            </View>

            {!ownFolder && !joined ? (
              <View style={styles.inlineJoinCard}>
                <Text style={styles.inlineJoinTitle}>Bu folder sizda hali yo'q</Text>
                <Text style={styles.inlineJoinText}>
                  Ichidagi lug'atlar bilan ishlash uchun avval uni yuklab oling.
                </Text>
              </View>
            ) : null}

            {ownFolder ? (
              <Pressable style={styles.dangerOutlineButton} onPress={onDelete}>
                <Trash2 size={16} color={Colors.danger} />
                <Text style={styles.dangerOutlineButtonText}>Folderni o'chirish</Text>
              </Pressable>
            ) : null}

            <View style={styles.sheetSection}>
              <Text style={styles.sectionTitle}>Ichidagi lug'atlar</Text>
              {decks.length ? (
                decks.map((deck, index) => {
                  const deckId = String(deck._id || deck.urlSlug || index);
                  return (
                    <Pressable
                      key={deckId}
                      style={styles.resourceRow}
                      onPress={() => onOpenDeck(deck)}
                    >
                      <View style={styles.resourceIcon}>
                        <Layers3 size={15} color={Colors.primary} />
                      </View>
                      <View style={styles.resourceMeta}>
                        <Text style={styles.resourceTitle}>
                          {deck.title?.trim() || "Nomsiz to'plam"}
                        </Text>
                        <Text style={styles.resourceSubtitle}>
                          {getDeckCardCount(deck)} ta karta
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.sheetEmptyText}>Bu folderga hali lug'at qo'shilmagan.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </DraggableBottomSheet>
  );
}

function FlashcardFolderEditorSheet({
  visible,
  folder,
  saving,
  onClose,
  onSave,
}: FolderEditorSheetProps) {
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!visible) {
      return;
    }

    setTitle(String(folder?.title || "").trim());
  }, [folder?.title, visible]);

  return (
    <DraggableBottomSheet
      visible={visible}
      title={folder?._id ? "Folderni tahrirlash" : "Yangi folder"}
      onClose={onClose}
      footer={
        <View style={styles.sheetFooterSafeArea}>
          <View style={styles.sheetFooterRow}>
            <Pressable style={styles.footerSecondaryButton} onPress={onClose}>
              <Text style={styles.footerSecondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[
                styles.footerPrimaryButton,
                (!title.trim() || saving) && styles.footerButtonDisabled,
              ]}
              disabled={!title.trim() || saving}
              onPress={() => onSave(title.trim())}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.footerPrimaryButtonText}>Saqlash</Text>
              )}
            </Pressable>
          </View>
        </View>
      }
      minHeight={340}
      initialHeightRatio={0.52}
      maxHeightRatio={0.68}
    >
      <View style={styles.folderEditorContent}>
        <Text style={styles.label}>Folder nomi</Text>
        <TextInput
          placeholder="Masalan: IELTS so'zlari"
          placeholderTextColor={Colors.subtleText}
          value={title}
          onChangeText={setTitle}
          style={styles.folderEditorInput}
        />
      </View>
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
  const [folders, setFolders] = useState<ArenaFlashcardFolder[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menuState, setMenuState] = useState<DeckMenuState | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingDeck, setEditingDeck] = useState<ArenaFlashcardDeck | null>(null);
  const [folderEditorVisible, setFolderEditorVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ArenaFlashcardFolder | null>(null);
  const [detailDeck, setDetailDeck] = useState<ArenaFlashcardDeck | null>(null);
  const [detailMode, setDetailMode] = useState<"preview" | "training" | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailActionDeckId, setDetailActionDeckId] = useState<string | null>(null);
  const [folderDetail, setFolderDetail] = useState<ArenaFlashcardFolder | null>(null);
  const [folderDetailLoading, setFolderDetailLoading] = useState(false);
  const [folderPreviewVisible, setFolderPreviewVisible] = useState(false);
  const [folderActionId, setFolderActionId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [promptSide, setPromptSide] = useState<ArenaFlashcardPromptSide>("front");
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>(NO_FOLDER_FILTER_ID);

  const myDeckCount = useMemo(
    () => decks.filter((deck) => isDeckOwner(deck, currentUserId)).length,
    [currentUserId, decks],
  );
  const ownedFolders = useMemo(
    () => folders.filter((folder) => isFolderOwner(folder, currentUserId)),
    [currentUserId, folders],
  );
  const joinedFolders = useMemo(
    () =>
      folders.filter(
        (folder) =>
          !isFolderOwner(folder, currentUserId) && isFolderJoined(folder, currentUserId),
      ),
    [currentUserId, folders],
  );
  const selectedFolder = useMemo(() => {
    if (selectedFolderFilter === NO_FOLDER_FILTER_ID) {
      return null;
    }

    const matchesSelectedFolder = (folder?: ArenaFlashcardFolder | null) =>
      getFolderIdentifierCandidates(folder).includes(selectedFolderFilter);

    return (
      folders.find((folder) => matchesSelectedFolder(folder)) ||
      (matchesSelectedFolder(folderDetail) ? folderDetail : null)
    );
  }, [folderDetail, folders, selectedFolderFilter]);
  const visibleFolderChips = useMemo(() => {
    const baseFolders = mergeFlashcardFolders(ownedFolders, joinedFolders);
    const selectedFolderInBase = baseFolders.some((folder) =>
      getFolderIdentifierCandidates(folder).includes(selectedFolderFilter),
    );

    if (!selectedFolder || selectedFolderInBase) {
      return baseFolders;
    }

    return mergeFlashcardFolders(baseFolders, [selectedFolder]);
  }, [joinedFolders, ownedFolders, selectedFolder, selectedFolderFilter]);
  const allKnownDecks = useMemo(() => {
    const decksFromFolders = folders.flatMap((folder) =>
      Array.isArray(folder.decks) ? folder.decks : [],
    );
    const decksFromFolderDetail = Array.isArray(folderDetail?.decks) ? folderDetail.decks : [];
    return mergeFlashcardDecks(decks, [...decksFromFolders, ...decksFromFolderDetail]);
  }, [decks, folderDetail?.decks, folders]);
  const filteredDecks = useMemo(() => {
    if (selectedFolderFilter === NO_FOLDER_FILTER_ID) {
      return allKnownDecks.filter((deck) => !getDeckFolderIdentifier(deck));
    }

    return allKnownDecks.filter((deck) =>
      getDeckFolderIdentifierCandidates(deck).includes(selectedFolderFilter),
    );
  }, [allKnownDecks, selectedFolderFilter]);
  const findKnownFolderById = useCallback(
    (folderId: string) =>
      folders.find((folder) => getFolderIdentifierCandidates(folder).includes(folderId)) ||
      (getFolderIdentifierCandidates(folderDetail).includes(folderId) ? folderDetail : null),
    [folderDetail, folders],
  );
  const selectedFolderId = getFolderIdentifier(selectedFolder);
  const canDeleteSelectedFolder = Boolean(selectedFolder && isFolderOwner(selectedFolder, currentUserId));
  const deletingSelectedFolder = Boolean(
    selectedFolderId && deletingFolderId === selectedFolderId,
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      const cachedDecks = await loadFlashcardDeckListCache();
      if (!active || !cachedDecks.length) {
        return;
      }

      setDecks(cachedDecks);
      setInitialLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

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

  const loadFolders = async (silent = false) => {
    try {
      const payload = await arenaApi.fetchFlashcardFolders();
      setFolders((current) =>
        mergeFlashcardFolders(current, Array.isArray(payload.data) ? payload.data : []),
      );
    } catch (error) {
      if (!silent) {
        Alert.alert(
          "Folderlar yuklanmadi",
          error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
        );
      }
    }
  };

  const loadFolderDetail = async (
    folderId: string,
    options?: {
      joinIfNeeded?: boolean;
      resetDetail?: boolean;
    },
  ) => {
    if (options?.resetDetail) {
      setFolderDetail(null);
    }
    setFolderDetailLoading(true);
    try {
      let payload = await arenaApi.fetchFlashcardFolder(folderId);

      if (
        options?.joinIfNeeded &&
        currentUserId &&
        !isFolderOwner(payload, currentUserId) &&
        !isFolderJoined(payload, currentUserId)
      ) {
        payload = await arenaApi.joinFlashcardFolder(folderId);
        await loadDecks(1, { replace: true, silent: true });
        await loadFolders(true);
      }

      setFolders((current) => mergeFlashcardFolders(current, [payload]));
      setDecks((current) =>
        mergeFlashcardDecks(current, Array.isArray(payload.decks) ? payload.decks : []),
      );
      setFolderDetail(payload);
      setSelectedFolderFilter((current) =>
        current === NO_FOLDER_FILTER_ID ? current : getFolderIdentifier(payload) || folderId,
      );
    } catch (error) {
      Alert.alert(
        "Folder ochilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setFolderDetailLoading(false);
    }
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
      const cachedDecks = replace ? [] : await loadFlashcardDeckListCache();
      const nextDecks = replace
        ? items
        : mergeFlashcardDecks(cachedDecks.length ? cachedDecks : decks, items);

      setDecks(nextDecks);
      setPage(Number(payload.page || nextPage));
      setHasMore(Number(payload.page || nextPage) < Number(payload.totalPages || 1));
      await replaceFlashcardDeckListCache(nextDecks);
    } catch (error) {
      const cachedDecks = await loadFlashcardDeckListCache();
      if (cachedDecks.length) {
        setDecks(cachedDecks);
        setHasMore(false);
        setPage(1);
      }

      if (!silent) {
        if (cachedDecks.length) {
          Alert.alert("Offline rejim", "Saqlangan flashcard to'plamlari ko'rsatildi.");
        } else {
        Alert.alert(
          "Flashcards yuklanmadi",
          error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
        );
        }
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
      await upsertFlashcardDeckCache(payload);
    } catch (error) {
      const cachedDeck = await getFlashcardDeckCache(deckId);
      if (cachedDeck) {
        setDetailDeck(cachedDeck);
        Alert.alert("Offline rejim", "Saqlangan lug'at ochildi.");
      } else {
        setDetailMode(null);
        setDetailDeck(null);
        Alert.alert(
          "Lugat ochilmadi",
          error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
        );
      }
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadDecks(1, { replace: true });
    void loadFolders(true);

    const unsubscribe = navigation.addListener("focus", () => {
      void loadDecks(1, { replace: true, silent: false });
      void loadFolders(true);
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const deckId = String(route.params?.deckId || "");
    const folderId = String(route.params?.folderId || "");
    if (!deckId || folderId) {
      return;
    }

    setFolderDetail(null);
    setFolderDetailLoading(false);
    void loadDeckDetail(deckId, "preview");
    navigation.setParams({ deckId: null });
  }, [route.params?.deckId, route.params?.folderId]);

  useEffect(() => {
    const folderId = String(route.params?.folderId || "");
    if (!folderId) {
      return;
    }

    const seededFolder = findKnownFolderById(folderId);
    setFolderPreviewVisible(true);
    setFolderDetail(seededFolder);
    setDetailMode(null);
    setDetailDeck(null);
    setDetailLoading(false);
    setSelectedFolderFilter(folderId);
    void loadFolderDetail(folderId, { resetDetail: !seededFolder });
    navigation.setParams({ deckId: null, folderId: null });
  }, [findKnownFolderById, currentUserId, navigation, route.params?.folderId]);

  const handleBack = () => {
    navigation.navigate("MainTabs", {
      screen: "Courses",
      params: { viewMode: "arena" },
    });
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

  const handleCopyFolderLink = async (folder: ArenaFlashcardFolder) => {
    const identifier = getFolderIdentifier(folder);
    if (!identifier) {
      Alert.alert("Havola tayyor emas", "Bu folder uchun havola hali mavjud emas.");
      return;
    }

    await Clipboard.setStringAsync(`${APP_BASE_URL}/arena/flashcard-folders/${identifier}`);
    Alert.alert("Nusxalandi", "Folder havolasi clipboard'ga saqlandi.");
  };

  const handleOpenSelectedFolderPreview = () => {
    const folderId = getFolderIdentifier(selectedFolder);
    if (!folderId || !selectedFolder) {
      return;
    }

    setFolderDetail(selectedFolder);
    setFolderPreviewVisible(true);
    void loadFolderDetail(folderId);
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

  const handleOpenCreateFolder = () => {
    setEditingFolder(null);
    setFolderEditorVisible(true);
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

  const handleOpenFolderPreview = async (folder: ArenaFlashcardFolder) => {
    const folderId = String(folder._id || folder.urlSlug || "");
    if (!folderId) {
      Alert.alert("Folder topilmadi", "Bu folderni ochib bo'lmadi.");
      return;
    }

    setFolderDetail(folder);
    setFolderPreviewVisible(true);
    void loadFolderDetail(folderId);
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
                await removeFlashcardDeckCache(String(deck._id));
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
      await upsertFlashcardDeckCache(updatedDeck);
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

  const handleJoinFolder = async () => {
    const folderId = String(folderDetail?._id || folderDetail?.urlSlug || "");
    if (!folderId || folderActionId) {
      return;
    }

    setFolderActionId(folderId);
    try {
      const updatedFolder = await arenaApi.joinFlashcardFolder(folderId);
      setFolders((current) => mergeFlashcardFolders(current, [updatedFolder]));
      setDecks((current) =>
        mergeFlashcardDecks(current, Array.isArray(updatedFolder.decks) ? updatedFolder.decks : []),
      );
      setFolderDetail(updatedFolder);
      setSelectedFolderFilter(getFolderIdentifier(updatedFolder) || folderId);
      await loadDecks(1, { replace: true, silent: true });
      await loadFolders(true);
    } catch (error) {
      Alert.alert(
        "Folderga qo'shilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setFolderActionId(null);
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
                await removeFlashcardDeckCache(deckId);
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

  const handleLeaveFolder = async () => {
    const folderId = String(folderDetail?._id || folderDetail?.urlSlug || "");
    if (!folderId || folderActionId) {
      return;
    }

    Alert.alert(
      "Folderdan chiqasizmi?",
      "Ichidagi lug'atlardan ham chiqib ketasiz va progress o'chadi.",
      [
        { text: "Bekor qilish", style: "cancel" },
        {
          text: "Chiqish",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setFolderActionId(folderId);
              try {
                const updatedFolder = await arenaApi.leaveFlashcardFolder(folderId);
                setFolderDetail(updatedFolder);
                await loadDecks(1, { replace: true, silent: true });
                await loadFolders(true);
              } catch (error) {
                Alert.alert(
                  "Chiqib bo'lmadi",
                  error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
                );
              } finally {
                setFolderActionId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const handleDeleteFolder = (folder?: ArenaFlashcardFolder | null) => {
    const targetFolder = folder || folderDetail || selectedFolder;
    const folderId = getFolderIdentifier(targetFolder);
    if (!folderId || deletingFolderId) {
      return;
    }

    Alert.alert(
      "Folderni o'chirasizmi?",
      "Bu amal folder ichidagi barcha lug'atlar, kartalar va progresslarni ham o'chiradi.",
      [
        { text: "Bekor qilish", style: "cancel" },
        {
          text: "O'chirish",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setDeletingFolderId(folderId);
                let loadedFolder = targetFolder ?? null;
                try {
                  loadedFolder = await arenaApi.fetchFlashcardFolder(folderId);
                } catch {}
                const localFolderDecks = allKnownDecks.filter((deck) =>
                  getDeckFolderIdentifierCandidates(deck).includes(folderId),
                );
                const deckIds = Array.from(
                  new Set(
                    [
                      ...(Array.isArray(loadedFolder?.decks) ? loadedFolder.decks : []),
                      ...(Array.isArray(targetFolder?.decks) ? targetFolder.decks : []),
                      ...localFolderDecks,
                    ]
                      .map((deck) => getDeckIdentifier(deck))
                      .filter(Boolean),
                  ),
                );

                for (const deckId of deckIds) {
                  await arenaApi.deleteFlashcardDeck(deckId);
                  await removeFlashcardDeckCache(deckId);
                }

                if (detailDeck?._id && deckIds.includes(String(detailDeck._id))) {
                  setDetailDeck(null);
                  setDetailMode(null);
                }
                await arenaApi.deleteFlashcardFolder(folderId);
                setFolderDetail(null);
                setFolderPreviewVisible(false);
                setSelectedFolderFilter(NO_FOLDER_FILTER_ID);
                await loadDecks(1, { replace: true, silent: true });
                await loadFolders(true);
              } catch (error) {
                Alert.alert(
                  "Folder o'chirilmadi",
                  error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
                );
              } finally {
                setDeletingFolderId(null);
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

    void upsertFlashcardDeckCache(payloadDeck);
    setDetailMode(null);
    setDetailDeck(null);
    navigation.navigate("ArenaFlashcardStudy", {
      deckId,
      deck: payloadDeck,
      mode,
      promptSide,
    });
  };

  const handleSaveFolder = async (title: string) => {
    setSavingFolder(true);
    try {
      const nextFolder =
        editingFolder?._id || editingFolder?.urlSlug
          ? await arenaApi.updateFlashcardFolder(
              String(editingFolder._id || editingFolder.urlSlug || ""),
              { title },
            )
          : await arenaApi.createFlashcardFolder({ title });

      setFolderEditorVisible(false);
      setEditingFolder(null);
      setFolderDetail(nextFolder);
      setSelectedFolderFilter(getFolderIdentifier(nextFolder) || NO_FOLDER_FILTER_ID);
      await loadFolders(true);
    } catch (error) {
      Alert.alert(
        editingFolder ? "Folder yangilanmadi" : "Folder yaratilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setSavingFolder(false);
    }
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

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.decksSectionHeader}>
        <Text style={styles.decksSectionTitle}>Lug'atlar</Text>
        {selectedFolder ? (
          <View style={styles.decksHeaderActions}>
            {canDeleteSelectedFolder ? (
              <Pressable
                style={[
                  styles.decksHeaderAction,
                  deletingSelectedFolder && styles.footerButtonDisabled,
                ]}
                disabled={deletingSelectedFolder}
                onPress={() => handleDeleteFolder(selectedFolder)}
              >
                <Trash2 size={15} color={Colors.danger} />
              </Pressable>
            ) : null}
            <Pressable
              style={styles.decksHeaderAction}
              onPress={handleOpenSelectedFolderPreview}
            >
              <Eye size={15} color={Colors.primary} />
            </Pressable>
            <Pressable
              style={styles.decksHeaderAction}
              onPress={() => void handleCopyFolderLink(selectedFolder)}
            >
              <Link2 size={15} color={Colors.primary} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );

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
          </View>

          <View style={[styles.headerSlot, styles.headerSlotEnd]}>
            <Pressable style={styles.headerButton} onPress={handleOpenCreate}>
              <Plus size={18} color={Colors.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.folderChipsBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.folderChipList}
          >
            <Pressable
              style={[
                styles.folderChip,
                selectedFolderFilter === NO_FOLDER_FILTER_ID && styles.folderChipActive,
              ]}
              onPress={() => setSelectedFolderFilter(NO_FOLDER_FILTER_ID)}
            >
              <Text
                style={[
                  styles.folderChipText,
                  selectedFolderFilter === NO_FOLDER_FILTER_ID && styles.folderChipTextActive,
                ]}
              >
                Foldersiz
              </Text>
            </Pressable>

            {visibleFolderChips.map((folder) => {
              const folderId = getFolderIdentifier(folder);
              const isActive = selectedFolderFilter === folderId;
              return (
                <Pressable
                  key={folderId}
                  style={[styles.folderChip, isActive && styles.folderChipActive]}
                  onPress={() => setSelectedFolderFilter(folderId)}
                >
                  <FolderOpen size={14} color={isActive ? "#fff" : Colors.primary} />
                  <Text
                    style={[styles.folderChipText, isActive && styles.folderChipTextActive]}
                    numberOfLines={1}
                  >
                    {folder.title?.trim() || "Nomsiz folder"}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable style={styles.folderAddButton} onPress={handleOpenCreateFolder}>
            <Plus size={16} color={Colors.text} />
          </Pressable>
        </View>

        {initialLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredDecks}
            keyExtractor={(item, index) => String(item._id || item.urlSlug || `deck-${index}`)}
            renderItem={renderDeckCard}
            ListHeaderComponent={listHeader}
            contentContainerStyle={[
              styles.listContent,
              filteredDecks.length === 0 && styles.listContentEmpty,
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
                <Text style={styles.emptyTitle}>
                  {selectedFolderFilter === NO_FOLDER_FILTER_ID
                    ? "Foldersiz flashcardlar yo'q"
                    : "Bu folderda flashcard yo'q"}
                </Text>
                <Text style={styles.emptyDescription}>
                  {selectedFolderFilter === NO_FOLDER_FILTER_ID
                    ? "Yangi to'plam yarating yoki mavjud deckni folderga biriktirmasdan saqlang."
                    : "Boshqa folderni tanlang yoki shu folder uchun yangi flashcard yarating."}
                </Text>
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
          folders={folders.filter((folder) => isFolderOwner(folder, currentUserId))}
          onClose={() => {
            setEditorVisible(false);
            setEditingDeck(null);
          }}
          onSaved={async () => {
            await loadDecks(1, { replace: true, silent: true });
            await loadFolders(true);
          }}
        />

        <FlashcardFolderPreviewSheet
          visible={folderPreviewVisible && Boolean(folderDetail)}
          folder={folderDetail}
          loading={folderDetailLoading}
          currentUserId={currentUserId}
          joining={Boolean(
            folderActionId && folderActionId === String(folderDetail?._id || folderDetail?.urlSlug || ""),
          )}
          leaving={Boolean(
            folderActionId && folderActionId === String(folderDetail?._id || folderDetail?.urlSlug || ""),
          )}
          onClose={() => {
            setFolderPreviewVisible(false);
            setFolderDetail(null);
            setFolderDetailLoading(false);
          }}
          onJoin={() => void handleJoinFolder()}
          onLeave={() => void handleLeaveFolder()}
          onCopyLink={() => void (folderDetail ? handleCopyFolderLink(folderDetail) : undefined)}
          onOpenDeck={(deck) => {
            setFolderPreviewVisible(false);
            setFolderDetail(null);
            void handleOpenPreview(deck);
          }}
          onEdit={() => {
            if (!folderDetail) {
              return;
            }
            setFolderPreviewVisible(false);
            setFolderDetail(null);
            setEditingFolder(folderDetail);
            setFolderEditorVisible(true);
          }}
          onDelete={handleDeleteFolder}
        />

        <FlashcardFolderEditorSheet
          visible={folderEditorVisible}
          folder={editingFolder}
          saving={savingFolder}
          onClose={() => {
            setFolderEditorVisible(false);
            setEditingFolder(null);
          }}
          onSave={(title) => {
            void handleSaveFolder(title);
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
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
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
    justifyContent: "flex-start",
  },
  listHeader: {
    gap: 8,
    paddingBottom: 6,
  },
  folderChipsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  folderChipList: {
    gap: 10,
    paddingRight: 4,
  },
  folderChip: {
    minHeight: 38,
    maxWidth: 180,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  folderChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  folderChipText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  folderChipTextActive: {
    color: "#fff",
  },
  folderRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  folderSectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  folderSectionSubtitle: {
    marginTop: 4,
    color: Colors.mutedText,
    fontSize: 12,
  },
  folderAddButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 2,
  },
  folderRow: {
    gap: 12,
    paddingRight: 8,
  },
  folderCard: {
    width: 180,
    minHeight: 120,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 10,
  },
  folderCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  folderOwnedBadge: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  folderCardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  folderCardMeta: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },
  folderEmptyCard: {
    minHeight: 92,
    minWidth: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  folderEmptyText: {
    color: Colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
  },
  decksSectionHeader: {
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  decksHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  decksSectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  decksHeaderAction: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
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
  sheetFooterSafeArea: {
    backgroundColor: Colors.surface,
    paddingTop: 4,
    paddingBottom: 12,
    paddingHorizontal: 18,
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
  sheetLoading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetEmptyText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  dangerOutlineButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dangerOutlineButtonText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  folderEditorContent: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 10,
  },
  label: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  folderEditorInput: {
    width: "100%",
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    color: Colors.text,
    fontSize: 16,
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
  previewStatCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    padding: 12,
    gap: 6,
    alignItems: "flex-start",
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
  inlineJoinCard: {
    gap: 12,
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    padding: 14,
  },
  inlineJoinTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  inlineJoinText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  previewSection: {
    gap: 12,
  },
  sheetSection: {
    gap: 12,
  },
  previewSectionTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  sectionTitle: {
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
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    padding: 12,
  },
  resourceIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceMeta: {
    flex: 1,
    gap: 2,
  },
  resourceTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  resourceSubtitle: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  sectionEmptyText: {
    color: Colors.subtleText,
    fontSize: 13,
  },
  sheetFooterRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
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
