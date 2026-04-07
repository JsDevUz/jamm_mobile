import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Globe,
  GraduationCap,
  HardDrive,
  Headphones,
  Heart,
  ImageIcon,
  Lock,
  LogOut,
  MessageSquare,
  Newspaper,
  Palette,
  Pencil,
  Plus,
  UserPlus,
  UserCheck,
  Shield,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { Avatar } from "../../components/Avatar";
import { GuidedTourTarget } from "../../components/GuidedTourTarget";
import { PersistentCachedImage } from "../../components/PersistentCachedImage";
import { TextInput } from "../../components/TextInput";
import {
  OfficialBadgeIcon,
  PremiumBadgeIcon,
  UserDisplayName,
} from "../../components/UserDisplayName";
import { APP_LIMITS, countWords } from "../../constants/appLimits";
import {
  articlesApi,
  authApi,
  chatsApi,
  coursesApi,
  premiumApi,
  postsApi,
  usersApi,
} from "../../lib/api";
import {
  clearCourseVideoStorage,
  clearFeedStorage,
  deleteCourseVideoStorageItem,
  deleteFeedStorageItem,
  getDeviceStorageUsage,
} from "../../lib/storage-usage";
import { setAppUnlockToken } from "../../lib/session";
import { useI18n } from "../../i18n";
import type {
  MainTabsParamList,
  MainTabScreenProps,
  ProfilePaneRouteName,
  ProfilePaneSection,
  RootStackParamList,
} from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import useGuidedTourStore from "../../store/guided-tour-store";
import { Colors } from "../../theme/colors";
import type { ChatSummary, ProfileDecoration, User } from "../../types/entities";
import type { FeedImage, FeedPost } from "../../types/posts";
import { getEntityId } from "../../utils/chat";

const appPackage = require("../../../package.json") as { version?: string };
const APP_VERSION = String(appPackage?.version || "");

type Props = MainTabScreenProps<"Profile">;
type ProfilePaneProps = NativeStackScreenProps<RootStackParamList, ProfilePaneRouteName>;
type ProfileEditProps = NativeStackScreenProps<RootStackParamList, "EditProfile">;
type PremiumBenefitsProps = NativeStackScreenProps<RootStackParamList, "PremiumBenefits">;

type ProfileTab =
  | null
  | "groups"
  | "articles"
  | "courses"
  | "appearance"
  | "storage"
  | "language"
  | "security"
  | "premium"
  | "support"
  | "favorites"
  | "learn";

type ProfileArticle = {
  _id: string;
  title: string;
  slug?: string;
  excerpt?: string;
  coverImage?: string | null;
  likes?: number;
  views?: number;
  comments?: number;
  createdAt?: string;
  publishedAt?: string;
};

type CourseItem = {
  _id?: string;
  id?: string;
  name?: string;
  image?: string;
  createdBy?: string | User | null;
  lessonCount?: number;
  lessons?: Array<unknown>;
  membersCount?: number;
  totalMembersCount?: number;
};

type UtilitySelectionSheet = null | "language" | "theme";
type SecurityPinMode = "change" | "disable" | "setup";
type StorageView = "images" | "videos";

type PremiumPlan = {
  _id?: string;
  id?: string;
  name: string;
  durationInDays: number;
  price: number;
  features?: string[];
  isActive?: boolean;
};

type FavoriteLesson = {
  _id: string;
  title?: string;
  description?: string;
  likes?: number;
  views?: number;
  urlSlug?: string;
  addedAt?: string;
  course?: {
    _id?: string;
    name?: string;
    image?: string;
    urlSlug?: string;
  } | null;
};

const PRIMARY_TABS: Array<{
  key: Exclude<ProfileTab, null>;
  labelKey: string;
  icon: typeof MessageSquare;
  color: string;
}> = [
  { key: "groups", labelKey: "profile.tabs.groups", icon: MessageSquare, color: "#3ba55d" },
  { key: "articles", labelKey: "profile.tabs.articles", icon: Newspaper, color: "#2563eb" },
  { key: "courses", labelKey: "profile.tabs.courses", icon: GraduationCap, color: "#f59e0b" },
];

const UTILITY_TABS: Array<{
  key: Exclude<ProfileTab, null>;
  labelKey: string;
  icon: typeof Palette;
  color: string;
}> = [
  { key: "appearance", labelKey: "profile.tabs.appearance", icon: Palette, color: "#5865f2" },
  { key: "storage", labelKey: "profile.tabs.storage", icon: HardDrive, color: "#22c55e" },
  { key: "language", labelKey: "profile.tabs.language", icon: Globe, color: "#0ea5e9" },
  { key: "security", labelKey: "profile.tabs.security", icon: Lock, color: "#ef4444" },
  { key: "premium", labelKey: "profile.tabs.premium", icon: Shield, color: "#f59e0b" },
  { key: "support", labelKey: "profile.tabs.support", icon: Headphones, color: "#16a34a" },
  { key: "favorites", labelKey: "profile.tabs.favorites", icon: Heart, color: "#ec4899" },
  { key: "learn", labelKey: "profile.tabs.learn", icon: Sparkles, color: "#8b5cf6" },
];

const PROFILE_HEADER_FADE_START = 126;
const PROFILE_HEADER_FADE_END = 252;
const PROFILE_SUMMARY_FADE_START = 32;
const PROFILE_SUMMARY_FADE_END = 196;

const PROFILE_PANE_ROUTES: Record<Exclude<ProfileTab, null>, ProfilePaneRouteName> = {
  groups: "ProfileGroups",
  articles: "ProfileArticles",
  courses: "ProfileCourses",
  appearance: "ProfileAppearance",
  storage: "ProfileStorage",
  language: "ProfileLanguage",
  security: "ProfileSecurity",
  premium: "ProfilePremium",
  support: "ProfileSupport",
  favorites: "ProfileFavorites",
  learn: "ProfileLearn",
};

const PROFILE_PANE_SECTIONS_BY_ROUTE: Record<ProfilePaneRouteName, ProfilePaneSection> = {
  ProfileGroups: "groups",
  ProfileArticles: "articles",
  ProfileCourses: "courses",
  ProfileAppearance: "appearance",
  ProfileStorage: "storage",
  ProfileLanguage: "language",
  ProfileSecurity: "security",
  ProfilePremium: "premium",
  ProfileSupport: "support",
  ProfileFavorites: "favorites",
  ProfileLearn: "learn",
};

const PROFILE_TAB_TOUR_KEYS: Partial<Record<Exclude<ProfileTab, null>, string>> = {
  groups: "profile-groups-tab",
  articles: "profile-articles-tab",
  courses: "profile-courses-tab",
  appearance: "profile-appearance-tab",
  storage: "profile-storage-tab",
  language: "profile-language-tab",
  premium: "profile-premium-tab",
  support: "profile-support-tab",
  favorites: "profile-favorites-tab",
};

type PremiumLimitValue = string | number;

type PremiumSection = {
  key: string;
  title: string;
  description: string;
  items: Array<{
    label: string;
    ordinary: PremiumLimitValue;
    premium: PremiumLimitValue;
  }>;
};

function formatPremiumMegabytes(value: number) {
  return `${Math.round(value / (1024 * 1024))}MB`;
}

function formatJoinedDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPostDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "short",
  })} · ${date.toLocaleTimeString("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatStorageBytes(bytes?: number | null) {
  const value = Number(bytes || 0);
  if (!value) {
    return "0 MB";
  }
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function normalizeStorageTimestamp(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric =
    typeof value === "number" ? value : Number(new Date(String(value)).getTime());
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

function formatStorageDate(value?: number | string | null) {
  const timestamp = normalizeStorageTimestamp(value);
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPhone(value = "") {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits.length) {
    return "+998";
  }

  let localDigits = digits;
  if (localDigits.startsWith("998")) {
    localDigits = localDigits.slice(3);
  }
  localDigits = localDigits.slice(0, 9);

  let formatted = "+998";
  if (localDigits.length > 0) formatted += ` ${localDigits.slice(0, 2)}`;
  if (localDigits.length > 2) formatted += ` ${localDigits.slice(2, 5)}`;
  if (localDigits.length > 5) formatted += ` ${localDigits.slice(5, 7)}`;
  if (localDigits.length > 7) formatted += ` ${localDigits.slice(7, 9)}`;

  return formatted;
}

function normalizePhoneForPayload(value = "") {
  return String(value || "").replace(/\s/g, "");
}

function ProfilePaneHeader({
  title,
  canGoBack = true,
  action,
  onBack,
}: {
  title: string;
  canGoBack?: boolean;
  action?: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <View style={styles.paneHeader}>
      {canGoBack ? (
        <Pressable style={styles.paneHeaderButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </Pressable>
      ) : (
        <View style={styles.paneHeaderButton} />
      )}
      <Text style={styles.paneTitle}>{title}</Text>
      <View style={styles.paneHeaderAction}>{action || <View style={styles.paneHeaderButton} />}</View>
    </View>
  );
}

function EmptyPane({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyPane}>
      <View style={styles.emptyPaneIcon}>{icon}</View>
      <Text style={styles.emptyPaneTitle}>{title}</Text>
      <Text style={styles.emptyPaneDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.primaryButton} onPress={onAction}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProfilePostImages({
  images,
}: {
  images: FeedImage[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const startXRef = useRef(0);

  if (!images.length) return null;

  return (
    <View style={styles.profileImageCarousel}>
      <Pressable
        style={styles.profileImageViewport}
        onTouchStart={(event) => {
          startXRef.current = event.nativeEvent.touches[0]?.pageX || 0;
        }}
        onTouchEnd={(event) => {
          const endX = event.nativeEvent.changedTouches[0]?.pageX || 0;
          const deltaX = endX - startXRef.current;

          if (Math.abs(deltaX) < 40) return;

          setActiveIndex((current) =>
            Math.max(0, Math.min(images.length - 1, current + (deltaX < 0 ? 1 : -1))),
          );
        }}
      >
        <PersistentCachedImage
          remoteUri={images[activeIndex].url}
          blurDataUrl={images[activeIndex].blurDataUrl}
          style={styles.profileImageFill}
        />
      </Pressable>

      {images.length > 1 ? (
        <View style={styles.profileImageDots}>
          {images.map((image, index) => (
            <Pressable
              key={`${image.url}-${index}`}
              style={[
                styles.profileImageDot,
                index === activeIndex && styles.profileImageDotActive,
              ]}
              onPress={() => setActiveIndex(index)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ProfilePostComposerModal({
  visible,
  initialContent,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  initialContent: string;
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
}) {
  const [text, setText] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(initialContent);
  }, [initialContent, visible]);

  const usedWords = countWords(text);

  const handleSubmit = async () => {
    if (!text.trim() || saving || usedWords > APP_LIMITS.postWords) {
      return;
    }

    setSaving(true);
    try {
      await onSubmit(text.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {initialContent ? "Gurungni tahrirlash" : "Yangi gurung"}
            </Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={18} color={Colors.mutedText} />
            </Pressable>
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Fikringizni yozing..."
            placeholderTextColor={Colors.subtleText}
            style={styles.modalInput}
            multiline
            maxLength={APP_LIMITS.postDraftChars}
            autoFocus
          />

          <View style={styles.modalFooter}>
            <Text
              style={[
                styles.modalCounter,
                usedWords > APP_LIMITS.postWords && styles.modalCounterDanger,
              ]}
            >
              {usedWords}/{APP_LIMITS.postWords}
            </Text>
            <Pressable
              style={[
                styles.primaryButton,
                (!text.trim() || saving || usedWords > APP_LIMITS.postWords) &&
                  styles.primaryButtonDisabled,
              ]}
              disabled={!text.trim() || saving || usedWords > APP_LIMITS.postWords}
              onPress={handleSubmit}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {initialContent ? "Saqlash" : "Yuborish"}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ProfileEditModal({
  visible,
  user,
  onClose,
  onSaved,
  asScreen = false,
}: {
  visible: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: (nextUser: User) => Promise<void>;
  asScreen?: boolean;
}) {
  const [profile, setProfile] = useState({
    nickname: "",
    username: "",
    phone: "+998",
    avatar: "",
    bio: "",
    premiumStatus: "none",
  });
  const [initialProfile, setInitialProfile] = useState({
    nickname: "",
    username: "",
    phone: "+998",
    avatar: "",
    bio: "",
    premiumStatus: "none",
  });
  const [pendingAvatarUri, setPendingAvatarUri] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saveStatus, setSaveStatus] = useState<null | "ok" | string>(null);

  useEffect(() => {
    if (!visible && !asScreen) return;

    const normalized = {
      nickname: user?.nickname || "",
      username: user?.username || "",
      phone: formatPhone(user?.phone || ""),
      avatar: user?.avatar || "",
      bio: user?.bio || "",
      premiumStatus: user?.premiumStatus || "none",
    };
    setProfile(normalized);
    setInitialProfile(normalized);
    setPendingAvatarUri("");
    setSaving(false);
    setUploadingAvatar(false);
    setSaveStatus(null);
  }, [asScreen, user, visible]);

  const hasChanges =
    profile.nickname !== initialProfile.nickname ||
    profile.username !== initialProfile.username ||
    profile.bio !== initialProfile.bio ||
    normalizePhoneForPayload(profile.phone) !== normalizePhoneForPayload(initialProfile.phone) ||
    Boolean(pendingAvatarUri);

  const validate = () => {
    if (profile.nickname && (profile.nickname.length < 3 || profile.nickname.length > 30)) {
      return "Nickname 3 tadan 30 tagacha bo'lishi kerak.";
    }

    if (profile.username && !/^[a-zA-Z0-9]{8,24}$/.test(profile.username)) {
      return "Username 8-24 ta harf va raqamdan iborat bo'lishi kerak.";
    }

    if ((profile.bio || "").length > APP_LIMITS.bioChars) {
      return `Bio ko'pi bilan ${APP_LIMITS.bioChars} belgi bo'lishi kerak.`;
    }

    if (profile.phone && !/^\+998 \d{2} \d{3} \d{2} \d{2}$/.test(profile.phone)) {
      return "Telefon raqam +998 XX XXX XX XX formatida bo'lishi kerak.";
    }

    return null;
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Ruxsat kerak", "Avatar tanlash uchun media kutubxonasiga ruxsat bering.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    const asset = result.assets[0];
    if ((asset.fileSize || 0) > 2 * 1024 * 1024) {
      Alert.alert("Fayl juda katta", "Avatar hajmi maksimum 2MB bo'lishi kerak.");
      return;
    }

    setPendingAvatarUri(asset.uri);
  };

  const handleSave = async () => {
    if (saving || uploadingAvatar) return;

    const error = validate();
    if (error) {
      setSaveStatus(error);
      return;
    }

    if (!hasChanges) {
      onClose();
      return;
    }

    setSaving(true);
    setSaveStatus(null);
    try {
      const payload: {
        nickname?: string;
        username?: string;
        phone?: string;
        bio?: string;
        avatar?: string;
      } = {};

      if (profile.nickname !== initialProfile.nickname) {
        payload.nickname = profile.nickname;
      }
      if (profile.username !== initialProfile.username) {
        payload.username = profile.username;
      }
      if (profile.bio !== initialProfile.bio) {
        payload.bio = profile.bio || "";
      }
      if (
        normalizePhoneForPayload(profile.phone) !== normalizePhoneForPayload(initialProfile.phone)
      ) {
        payload.phone = normalizePhoneForPayload(profile.phone);
      }
      if (pendingAvatarUri) {
        setUploadingAvatar(true);
        const response = await usersApi.uploadAvatar(pendingAvatarUri);
        payload.avatar = response.avatar || "";
      }

      const updatedUser =
        Object.keys(payload).length > 0 ? await usersApi.updateMe(payload) : (user as User);
      await onSaved(updatedUser);
      setSaveStatus("ok");
      setTimeout(() => {
        onClose();
      }, 320);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Saqlashda xatolik yuz berdi.");
    } finally {
      setSaving(false);
      setUploadingAvatar(false);
    }
  };

  const content = (
    <GuidedTourTarget targetKey="profile-edit-dialog" style={asScreen ? styles.profileEditScreenTarget : undefined}>
      {asScreen ? (
        <View style={[styles.profileEditCard, styles.profileEditCardScreen]}>
          <View style={styles.profileEditHeader}>
            <Text style={styles.profileEditTitle}>Profilni tahrirlash</Text>
            <Pressable style={styles.profileEditClose} onPress={onClose}>
              <X size={18} color={Colors.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.profileEditBody}
            contentContainerStyle={styles.profileEditBodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Pressable style={styles.profileEditAvatarWrap} onPress={() => void handlePickAvatar()}>
              <Avatar
                label={profile.nickname || profile.username || "?"}
                uri={pendingAvatarUri || profile.avatar}
                size={92}
                shape="circle"
              />
              <View style={styles.profileEditAvatarOverlay}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Camera size={20} color="#fff" />
                )}
              </View>
            </Pressable>

            <View style={styles.profileEditField}>
              <View style={styles.profileEditLabelRow}>
                <Text style={styles.profileEditLabel}>Nickname</Text>
                {profile.premiumStatus === "active" ? (
                  <View style={styles.profileEditPremiumBadge}>
                    <Text style={styles.profileEditPremiumBadgeText}>Premium</Text>
                  </View>
                ) : null}
              </View>
              <TextInput
                value={profile.nickname}
                onChangeText={(value) =>
                  setProfile((prev) => ({
                    ...prev,
                    nickname: value.slice(0, APP_LIMITS.nicknameChars),
                  }))
                }
                placeholder="Nickname"
                placeholderTextColor={Colors.subtleText}
                style={styles.profileEditInput}
              />
            </View>

            <View style={styles.profileEditField}>
              <Text style={styles.profileEditLabel}>Username</Text>
              <TextInput
                value={profile.username}
                onChangeText={(value) =>
                  setProfile((prev) => ({
                    ...prev,
                    username: value
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, "")
                      .slice(0, APP_LIMITS.usernameChars),
                  }))
                }
                placeholder="username"
                placeholderTextColor={Colors.subtleText}
                style={styles.profileEditInput}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.profileEditField}>
              <View style={styles.profileEditCounterRow}>
                <Text style={styles.profileEditLabel}>Haqida (Bio)</Text>
                <Text
                  style={[
                    styles.profileEditCounter,
                    (profile.bio?.length || 0) > APP_LIMITS.bioChars &&
                      styles.profileEditCounterDanger,
                  ]}
                >
                  {profile.bio?.length || 0}/{APP_LIMITS.bioChars}
                </Text>
              </View>
              <TextInput
                value={profile.bio || ""}
                onChangeText={(value) =>
                  setProfile((prev) => ({
                    ...prev,
                    bio: value.slice(0, APP_LIMITS.bioChars),
                  }))
                }
                placeholder="O'zingiz haqingizda qisqacha yozing..."
                placeholderTextColor={Colors.subtleText}
                style={styles.profileEditTextArea}
                multiline
              />
            </View>

            <View style={styles.profileEditField}>
              <Text style={styles.profileEditLabel}>Telefon raqam</Text>
              <TextInput
                value={profile.phone || "+998"}
                onChangeText={(value) =>
                  setProfile((prev) => ({
                    ...prev,
                    phone: formatPhone(value),
                  }))
                }
                placeholder="+998 90 000 00 00"
                placeholderTextColor={Colors.subtleText}
                style={styles.profileEditInput}
                keyboardType="phone-pad"
              />
            </View>
          </ScrollView>

          <View style={styles.profileEditSaveBar}>
            <Pressable
              style={[
                styles.primaryButton,
                (!hasChanges || saving || uploadingAvatar) && styles.primaryButtonDisabled,
              ]}
              disabled={!hasChanges || saving || uploadingAvatar}
              onPress={() => void handleSave()}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={styles.profileEditSaveInner}>
                  <Check size={14} color="#fff" />
                  <Text style={styles.primaryButtonText}>Saqlash</Text>
                </View>
              )}
            </Pressable>
            {saveStatus === "ok" ? (
              <View style={styles.profileEditStatus}>
                <Check size={13} color={Colors.accent} />
                <Text style={styles.profileEditStatusText}>Muvaffaqiyatli saqlandi</Text>
              </View>
            ) : saveStatus ? (
              <View style={styles.profileEditStatus}>
                <AlertCircle size={13} color={Colors.danger} />
                <Text style={[styles.profileEditStatusText, styles.profileEditStatusTextError]}>
                  {saveStatus}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <Pressable style={styles.profileEditCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.profileEditHeader}>
              <Text style={styles.profileEditTitle}>Profilni tahrirlash</Text>
              <Pressable style={styles.profileEditClose} onPress={onClose}>
                <X size={18} color={Colors.text} />
              </Pressable>
            </View>

          <ScrollView
            style={styles.profileEditBody}
            contentContainerStyle={styles.profileEditBodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Pressable style={styles.profileEditAvatarWrap} onPress={() => void handlePickAvatar()}>
              <Avatar
                label={profile.nickname || profile.username || "?"}
                uri={pendingAvatarUri || profile.avatar}
                size={92}
                shape="circle"
              />
              <View style={styles.profileEditAvatarOverlay}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Camera size={20} color="#fff" />
                )}
              </View>
            </Pressable>

            <View style={styles.profileEditField}>
              <View style={styles.profileEditLabelRow}>
                <Text style={styles.profileEditLabel}>Nickname</Text>
                {profile.premiumStatus === "active" ? (
                  <View style={styles.profileEditPremiumBadge}>
                    <Text style={styles.profileEditPremiumBadgeText}>Premium</Text>
                  </View>
                ) : null}
              </View>
              <TextInput
                value={profile.nickname}
                onChangeText={(value) =>
                  setProfile((prev) => ({
                    ...prev,
                    nickname: value.slice(0, APP_LIMITS.nicknameChars),
                  }))
                }
                placeholder="Nickname"
                placeholderTextColor={Colors.subtleText}
                style={styles.profileEditInput}
              />
            </View>

            <View style={styles.profileEditField}>
              <Text style={styles.profileEditLabel}>Username</Text>
              <TextInput
                value={profile.username}
                onChangeText={(value) =>
                  setProfile((prev) => ({
                    ...prev,
                    username: value
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, "")
                      .slice(0, APP_LIMITS.usernameChars),
                  }))
                }
                placeholder="username"
                placeholderTextColor={Colors.subtleText}
                style={styles.profileEditInput}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.profileEditField}>
              <View style={styles.profileEditCounterRow}>
                <Text style={styles.profileEditLabel}>Haqida (Bio)</Text>
                <Text
                  style={[
                    styles.profileEditCounter,
                    (profile.bio?.length || 0) > APP_LIMITS.bioChars &&
                      styles.profileEditCounterDanger,
                  ]}
                >
                  {profile.bio?.length || 0}/{APP_LIMITS.bioChars}
                </Text>
              </View>
              <TextInput
                value={profile.bio || ""}
                onChangeText={(value) =>
                  setProfile((prev) => ({
                    ...prev,
                    bio: value.slice(0, APP_LIMITS.bioChars),
                  }))
                }
                placeholder="O'zingiz haqingizda qisqacha yozing..."
                placeholderTextColor={Colors.subtleText}
                style={styles.profileEditTextArea}
                multiline
              />
            </View>

            <View style={styles.profileEditField}>
              <Text style={styles.profileEditLabel}>Telefon raqam</Text>
              <TextInput
                value={profile.phone || "+998"}
                onChangeText={(value) =>
                  setProfile((prev) => ({
                    ...prev,
                    phone: formatPhone(value),
                  }))
                }
                placeholder="+998 90 000 00 00"
                placeholderTextColor={Colors.subtleText}
                style={styles.profileEditInput}
                keyboardType="phone-pad"
              />
            </View>
          </ScrollView>

            <View style={styles.profileEditSaveBar}>
              <Pressable
                style={[
                  styles.primaryButton,
                  (!hasChanges || saving || uploadingAvatar) && styles.primaryButtonDisabled,
                ]}
                disabled={!hasChanges || saving || uploadingAvatar}
                onPress={() => void handleSave()}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={styles.profileEditSaveInner}>
                    <Check size={14} color="#fff" />
                    <Text style={styles.primaryButtonText}>Saqlash</Text>
                  </View>
                )}
              </Pressable>
              {saveStatus === "ok" ? (
                <View style={styles.profileEditStatus}>
                  <Check size={13} color={Colors.accent} />
                  <Text style={styles.profileEditStatusText}>Muvaffaqiyatli saqlandi</Text>
                </View>
              ) : saveStatus ? (
                <View style={styles.profileEditStatus}>
                  <AlertCircle size={13} color={Colors.danger} />
                  <Text style={[styles.profileEditStatusText, styles.profileEditStatusTextError]}>
                    {saveStatus}
                  </Text>
                </View>
              ) : null}
            </View>
        </Pressable>
      )}
    </GuidedTourTarget>
  );

  if (asScreen) {
    return (
      <SafeAreaView style={styles.profileEditScreenSafeArea} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.profileEditScreenRoot}>{content}</View>
      </SafeAreaView>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlayStrong} onPress={onClose}>
        {content}
      </Pressable>
    </Modal>
  );
}

function SecurityPinModal({
  visible,
  mode,
  loading,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: SecurityPinMode;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: { currentPin?: string; nextPin?: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setCurrentPin("");
      setNextPin("");
      setConfirmPin("");
      setError("");
    }
  }, [visible]);

  const title =
    mode === "disable"
      ? t("profileUtility.security.turnOffTitle")
      : mode === "change"
        ? t("profileUtility.security.currentPinTitle")
        : t("profileUtility.security.newPinTitle");
  const description =
    mode === "disable"
      ? t("profileUtility.security.turnOffDescription")
      : mode === "change"
        ? t("profileUtility.security.currentPinDescription")
        : t("profileUtility.security.newPinDescription");

  const handleSubmit = async () => {
    if (loading) return;

    if (mode === "disable") {
      if (currentPin.length !== 4) return;
      setError("");
      await onSubmit({ currentPin });
      return;
    }

    if (mode === "change" && currentPin.length !== 4) {
      return;
    }

    if (nextPin.length !== 4 || confirmPin.length !== 4) {
      return;
    }

    if (nextPin !== confirmPin) {
      setError(t("profileUtility.security.pinMismatch"));
      return;
    }

    setError("");
    await onSubmit({
      currentPin: mode === "change" ? currentPin : undefined,
      nextPin,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.securityModal} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.securityHelp}>{description}</Text>

          {mode === "change" || mode === "disable" ? (
            <TextInput
              value={currentPin}
              onChangeText={(value) => {
                setCurrentPin(value.replace(/[^0-9]/g, ""));
                setError("");
              }}
              placeholder={t("profileUtility.security.currentPinTitle")}
              placeholderTextColor={Colors.subtleText}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.securityInput}
              maxLength={4}
              autoFocus
            />
          ) : null}

          {mode !== "disable" ? (
            <>
              <TextInput
                value={nextPin}
                onChangeText={(value) => {
                  setNextPin(value.replace(/[^0-9]/g, ""));
                  setError("");
                }}
                placeholder={t("profileUtility.security.newPinTitle")}
                placeholderTextColor={Colors.subtleText}
                keyboardType="number-pad"
                secureTextEntry
                style={styles.securityInput}
                maxLength={4}
                autoFocus={mode === "setup"}
              />
              <TextInput
                value={confirmPin}
                onChangeText={(value) => {
                  setConfirmPin(value.replace(/[^0-9]/g, ""));
                  setError("");
                }}
                placeholder={t("profileUtility.security.confirmPinTitle")}
                placeholderTextColor={Colors.subtleText}
                keyboardType="number-pad"
                secureTextEntry
                style={styles.securityInput}
                maxLength={4}
              />
            </>
          ) : null}

          {error ? <Text style={styles.securityError}>{error}</Text> : null}
          <View style={styles.securityActions}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[
                mode === "disable" ? styles.dangerButton : styles.primaryButton,
                (
                  (mode === "disable" && currentPin.length !== 4) ||
                  (mode === "change" &&
                    (currentPin.length !== 4 || nextPin.length !== 4 || confirmPin.length !== 4)) ||
                  (mode === "setup" && (nextPin.length !== 4 || confirmPin.length !== 4)) ||
                  loading
                ) && styles.primaryButtonDisabled,
              ]}
              disabled={
                (mode === "disable" && currentPin.length !== 4) ||
                (mode === "change" &&
                  (currentPin.length !== 4 || nextPin.length !== 4 || confirmPin.length !== 4)) ||
                (mode === "setup" && (nextPin.length !== 4 || confirmPin.length !== 4)) ||
                loading
              }
              onPress={() => void handleSubmit()}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={mode === "disable" ? styles.dangerButtonText : styles.primaryButtonText}>
                  {mode === "disable"
                    ? t("profileUtility.security.disableAction")
                    : mode === "change"
                      ? t("profileUtility.security.changeAction")
                      : t("profileUtility.security.enableAction")}
                </Text>
          )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ProfileScreenContent({
  navigation,
  routeParams,
  forcedTab,
}: {
  navigation: Props["navigation"] | ProfilePaneProps["navigation"];
  routeParams?: {
    userId?: string | null;
    jammId?: string | number | null;
    returnTo?: Exclude<keyof MainTabsParamList, "Profile"> | null;
  };
  forcedTab?: ProfilePaneSection;
}) {
  const queryClient = useQueryClient();
  const { language, setLanguage, theme, setTheme, t } = useI18n();
  const guidedTourActive = useGuidedTourStore((state) => state.active);
  const guidedTourStepKey = useGuidedTourStore((state) => state.stepKey);
  const startGuidedTour = useGuidedTourStore((state) => state.start);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const currentUserId = getEntityId(user);
  const requestedUserId = String(routeParams?.userId || "").trim();
  const requestedJammId = String(routeParams?.jammId || "").trim();
  const requestedReturnTo = routeParams?.returnTo || "Feed";
  const requestedProfileIdentifier = requestedJammId || requestedUserId;
  const isRequestedOwnProfile =
    !requestedProfileIdentifier ||
    requestedUserId === currentUserId ||
    requestedJammId === String(user?.jammId || "");
  const isViewingOwnProfile = Boolean(user) && isRequestedOwnProfile;
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securityModalMode, setSecurityModalMode] = useState<SecurityPinMode>("setup");
  const [utilitySelectionSheet, setUtilitySelectionSheet] =
    useState<UtilitySelectionSheet>(null);
  const [storageView, setStorageView] = useState<StorageView>("images");
  const [storageTabsWidth, setStorageTabsWidth] = useState(0);
  const [storagePagerWidth, setStoragePagerWidth] = useState(0);
  const [promoCode, setPromoCode] = useState("");
  const profileScrollY = useRef(new Animated.Value(0)).current;
  const overviewScrollRef = useRef<ScrollView>(null);
  const profileEditRouteOpenedRef = useRef(false);
  const storageScrollX = useRef(new Animated.Value(0)).current;
  const storagePagerRef = useRef<ScrollView>(null);
  const activeTab = forcedTab ?? null;
  const resetOverviewScroll = useCallback(() => {
    const scrollTarget =
      (overviewScrollRef.current as any)?.getNode?.() || overviewScrollRef.current;
    scrollTarget?.scrollTo?.({
      y: 0,
      animated: false,
    });
    profileScrollY.setValue(0);
  }, [profileScrollY]);
  const themeOptions = useMemo(
    () =>
      (["dark", "light"] as const).map((value) => ({
        value,
        label: t(`theme.${value}`),
      })),
    [t],
  );
  const languageOptions = useMemo(
    () =>
      (["uz", "ru", "en"] as const).map((value) => ({
        value,
        label: t(`language.${value}`),
      })),
    [t],
  );
  const currentThemeLabel =
    themeOptions.find((option) => option.value === theme)?.label || t(`theme.${theme}`);
  const currentLanguageLabel =
    languageOptions.find((option) => option.value === language)?.label ||
    t(`language.${language}`);
  const utilitySheetTitle =
    utilitySelectionSheet === "theme"
      ? t("profileUtility.appearance.themeLabel")
      : t("profileUtility.language.languageLabel");
  const utilitySheetOptions =
    utilitySelectionSheet === "theme" ? themeOptions : languageOptions;
  const selectedUtilityValue = utilitySelectionSheet === "theme" ? theme : language;

  const setStorageViewWithPager = useCallback(
    (nextView: StorageView, animated = true) => {
      setStorageView(nextView);
      if (!storagePagerWidth) {
        return;
      }

      storagePagerRef.current?.scrollTo({
        x: nextView === "videos" ? storagePagerWidth : 0,
        animated,
      });
    },
    [storagePagerWidth],
  );

  useEffect(() => {
    if (!storagePagerWidth) {
      return;
    }

    storagePagerRef.current?.scrollTo({
      x: storageView === "videos" ? storagePagerWidth : 0,
      animated: false,
    });
    storageScrollX.setValue(storageView === "videos" ? storagePagerWidth : 0);
  }, [storagePagerWidth, storageScrollX, storageView]);

  const publicProfileQuery = useQuery({
    queryKey: ["public-profile", requestedProfileIdentifier],
    queryFn: () => usersApi.getPublicProfile(requestedProfileIdentifier),
    enabled: Boolean(requestedProfileIdentifier && !isViewingOwnProfile),
  });

  const displayUser = isViewingOwnProfile ? user : publicProfileQuery.data || null;
  const profileUserId = getEntityId(displayUser) || requestedUserId || "";
  const profilePostsIdentifier = profileUserId || currentUserId;
  const profileArticlesIdentifier = String(
    displayUser?.jammId || requestedJammId || profileUserId || currentUserId || "",
  ).trim();

  const postsQuery = useQuery({
    queryKey: ["profile-posts", profilePostsIdentifier],
    queryFn: () => postsApi.fetchUserPosts(profilePostsIdentifier),
    enabled: Boolean(profilePostsIdentifier),
  });

  const articlesQuery = useQuery({
    queryKey: ["profile-articles", profileArticlesIdentifier],
    queryFn: () => articlesApi.fetchUserArticles(profileArticlesIdentifier),
    enabled: Boolean(profileArticlesIdentifier),
  });

  const coursesQuery = useQuery({
    queryKey: ["courses", "profile"],
    queryFn: () => coursesApi.fetchCourses(1, 40),
    enabled:
      activeTab === "courses" ||
      activeTab === null ||
      activeTab === "learn" ||
      activeTab === "storage",
  });

  const decorationsQuery = useQuery({
    queryKey: ["profile-decorations"],
    queryFn: usersApi.getProfileDecorations,
    enabled: isViewingOwnProfile && (activeTab === "appearance" || activeTab === "premium"),
  });

  const appLockQuery = useQuery({
    queryKey: ["app-lock"],
    queryFn: usersApi.getAppLockStatus,
    enabled: isViewingOwnProfile && activeTab === "security",
  });

  const premiumPlansQuery = useQuery({
    queryKey: ["premium-plans"],
    queryFn: premiumApi.getPlans,
    enabled: isViewingOwnProfile && activeTab === "premium",
  });

  const likedPostsQuery = useQuery({
    queryKey: ["liked-posts"],
    queryFn: postsApi.fetchLikedPosts,
    enabled: isViewingOwnProfile && activeTab === "favorites",
  });

  const likedLessonsQuery = useQuery({
    queryKey: ["liked-lessons"],
    queryFn: coursesApi.fetchLikedLessons,
    enabled: isViewingOwnProfile && activeTab === "favorites",
  });

  const likedArticlesQuery = useQuery({
    queryKey: ["liked-articles"],
    queryFn: articlesApi.fetchLikedArticles,
    enabled: isViewingOwnProfile && activeTab === "favorites",
  });

  const storageUsageQuery = useQuery({
    queryKey: ["device-storage-usage"],
    queryFn: getDeviceStorageUsage,
    enabled: isViewingOwnProfile && activeTab === "storage",
  });

  const createPostMutation = useMutation({
    mutationFn: (content: string) => postsApi.createPost({ content }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile-posts", currentUserId] });
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: ({ postId, content }: { postId: string; content: string }) =>
      postsApi.updatePost(postId, { content }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile-posts", currentUserId] });
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId: string) => postsApi.deletePost(postId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile-posts", currentUserId] });
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const likePostMutation = useMutation({
    mutationFn: (postId: string) => postsApi.likePost(postId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile-posts", currentUserId] });
      await queryClient.invalidateQueries({ queryKey: ["liked-posts"] });
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const updateDecorationMutation = useMutation({
    mutationFn: (decorationId?: string | null) => usersApi.updateProfileDecoration(decorationId),
    onSuccess: async (updatedUser) => {
      setUser(updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["profile-decorations"] });
    },
  });

  const appLockMutation = useMutation({
    mutationFn: async (payload: {
      currentPin?: string;
      nextPin?: string;
      mode: SecurityPinMode;
    }) => {
      if (payload.mode === "disable") {
        const response = await usersApi.removeAppLockPin({ pin: payload.currentPin || "" });
        return {
          ...response,
          unlockToken: null,
        };
      }

      const response = await usersApi.setAppLockPin({
        pin: payload.nextPin || "",
        currentPin: payload.mode === "change" ? payload.currentPin : undefined,
      });
      let unlockToken: string | null = null;

      try {
        const verification = await usersApi.verifyAppLockPin({ pin: payload.nextPin || "" });
        if (verification?.valid && verification.unlockToken) {
          unlockToken = verification.unlockToken;
        }
      } catch {
        unlockToken = null;
      }

      return {
        ...response,
        unlockToken,
      };
    },
    onSuccess: async (result) => {
      setSecurityModalOpen(false);
      const appLockEnabled = Boolean(result.enabled);
      await setAppUnlockToken(result.unlockToken || null);
      if (user) {
        setUser({
          ...user,
          appLockEnabled,
          appLockSessionUnlocked: appLockEnabled
            ? Boolean(result.unlockToken)
            : true,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["app-lock"] });
    },
  });

  const groupInvitePrivacyMutation = useMutation({
    mutationFn: (allowGroupInvites: boolean) =>
      usersApi.updateMe({ disableGroupInvites: !allowGroupInvites }),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
    },
    onError: (error) => {
      Alert.alert(
        t("profileUtility.security.groupInvitesLabel"),
        error instanceof Error ? error.message : t("profileUtility.security.groupInvitesSaveError"),
      );
    },
  });

  const redeemPromoMutation = useMutation({
    mutationFn: (code: string) => premiumApi.redeemPromo(code),
    onSuccess: async () => {
      const refreshedUser = await authApi.me();
      setUser(refreshedUser);
      setPromoCode("");
      await queryClient.invalidateQueries({ queryKey: ["premium-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["profile-decorations"] });
      Alert.alert(
        t("premiumModal.title"),
        t("profileUtility.premium.activated"),
      );
    },
    onError: (error) => {
      Alert.alert(
        t("premiumModal.title"),
        error instanceof Error ? error.message : t("profileUtility.premium.invalidPromo"),
      );
    },
  });

  const refreshStorageUsage = async () => {
    await queryClient.invalidateQueries({ queryKey: ["device-storage-usage"] });
  };

  const deleteFeedStorageMutation = useMutation({
    mutationFn: (entryId: string) => deleteFeedStorageItem(entryId),
    onSuccess: refreshStorageUsage,
    onError: (error) => {
      Alert.alert(
        t("profileUtility.storage.title"),
        error instanceof Error ? error.message : t("profileUtility.storage.deleteFeedDescription"),
      );
    },
  });

  const clearFeedStorageMutation = useMutation({
    mutationFn: clearFeedStorage,
    onSuccess: refreshStorageUsage,
    onError: (error) => {
      Alert.alert(
        t("profileUtility.storage.title"),
        error instanceof Error ? error.message : t("profileUtility.storage.clearFeedDescription"),
      );
    },
  });

  const deleteCourseVideoStorageMutation = useMutation({
    mutationFn: (entryId: string) => deleteCourseVideoStorageItem(entryId),
    onSuccess: refreshStorageUsage,
    onError: (error) => {
      Alert.alert(
        t("profileUtility.storage.title"),
        error instanceof Error ? error.message : t("profileUtility.storage.deleteVideoDescription"),
      );
    },
  });

  const clearCourseVideoStorageMutation = useMutation({
    mutationFn: clearCourseVideoStorage,
    onSuccess: refreshStorageUsage,
    onError: (error) => {
      Alert.alert(
        t("profileUtility.storage.title"),
        error instanceof Error ? error.message : t("profileUtility.storage.clearVideosDescription"),
      );
    },
  });

  const ownedCourses = useMemo(() => {
    const allCourses = coursesQuery.data?.data || [];
    return allCourses.filter((course: CourseItem) => {
      const owner =
        typeof course.createdBy === "string"
          ? course.createdBy
          : getEntityId(course.createdBy as User | null);
      return owner === profileUserId;
    });
  }, [coursesQuery.data?.data, profileUserId]);

  const storageLabels = useMemo(() => {
    const courseNames = new Map<string, string>();
    const lessonTitles = new Map<string, string>();

    for (const course of coursesQuery.data?.data || []) {
      const courseName = String(course?.name || "").trim();
      for (const identifier of [course?._id, course?.id, course?.urlSlug]) {
        if (identifier && courseName) {
          courseNames.set(String(identifier), courseName);
        }
      }

      for (const lesson of course?.lessons || []) {
        const lessonTitle = String(lesson?.title || "").trim();
        for (const identifier of [lesson?._id, lesson?.id, lesson?.urlSlug]) {
          if (identifier && lessonTitle) {
            lessonTitles.set(String(identifier), lessonTitle);
          }
        }
      }
    }

    return {
      courseNames,
      lessonTitles,
    };
  }, [coursesQuery.data?.data]);

  const stats = useMemo(
    () => [
      { label: t("profile.stats.members"), value: String(displayUser?.followersCount || 0) },
      { label: t("profile.stats.posts"), value: String(postsQuery.data?.length || 0) },
      { label: t("profile.stats.articles"), value: String(articlesQuery.data?.length || 0) },
      { label: t("profile.stats.courses"), value: String(ownedCourses.length || 0) },
    ],
    [
      articlesQuery.data?.length,
      displayUser?.followersCount,
      ownedCourses.length,
      postsQuery.data?.length,
      t,
    ],
  );
  const headerProgress = profileScrollY.interpolate({
    inputRange: [PROFILE_HEADER_FADE_START, PROFILE_HEADER_FADE_END],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const headerBackdropOpacity = profileScrollY.interpolate({
    inputRange: [PROFILE_HEADER_FADE_START - 24, PROFILE_HEADER_FADE_END - 18],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const headerContentTranslateY = profileScrollY.interpolate({
    inputRange: [PROFILE_HEADER_FADE_START, PROFILE_HEADER_FADE_END],
    outputRange: [16, 0],
    extrapolate: "clamp",
  });
  const headerContentScale = profileScrollY.interpolate({
    inputRange: [PROFILE_HEADER_FADE_START - 28, PROFILE_HEADER_FADE_END],
    outputRange: [0.94, 1],
    extrapolate: "clamp",
  });
  const headerNameTranslateX = profileScrollY.interpolate({
    inputRange: [PROFILE_HEADER_FADE_START, PROFILE_HEADER_FADE_END],
    outputRange: [10, 0],
    extrapolate: "clamp",
  });
  const headerHandleOpacity = profileScrollY.interpolate({
    inputRange: [PROFILE_HEADER_FADE_START + 14, PROFILE_HEADER_FADE_END],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const summaryOpacity = profileScrollY.interpolate({
    inputRange: [PROFILE_SUMMARY_FADE_START, PROFILE_SUMMARY_FADE_END],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const summaryTranslateY = profileScrollY.interpolate({
    inputRange: [PROFILE_SUMMARY_FADE_START, PROFILE_SUMMARY_FADE_END + 20],
    outputRange: [0, -28],
    extrapolate: "clamp",
  });
  const summaryScale = profileScrollY.interpolate({
    inputRange: [PROFILE_SUMMARY_FADE_START, PROFILE_SUMMARY_FADE_END + 20],
    outputRange: [1, 0.94],
    extrapolate: "clamp",
  });
  const coverTranslateY = profileScrollY.interpolate({
    inputRange: [0, PROFILE_HEADER_FADE_END],
    outputRange: [0, -22],
    extrapolate: "clamp",
  });
  const infoTranslateY = profileScrollY.interpolate({
    inputRange: [0, PROFILE_HEADER_FADE_END],
    outputRange: [0, -18],
    extrapolate: "clamp",
  });
  const statsTranslateY = profileScrollY.interpolate({
    inputRange: [0, PROFILE_HEADER_FADE_END],
    outputRange: [0, -12],
    extrapolate: "clamp",
  });
  const avatarScale = profileScrollY.interpolate({
    inputRange: [0, PROFILE_HEADER_FADE_END],
    outputRange: [1, 0.84],
    extrapolate: "clamp",
  });
  const avatarTranslateY = profileScrollY.interpolate({
    inputRange: [0, PROFILE_HEADER_FADE_END],
    outputRange: [0, -10],
    extrapolate: "clamp",
  });

  const openProfileEdit = useCallback(() => {
    const rootNavigation = navigation as unknown as NativeStackNavigationProp<RootStackParamList>;
    rootNavigation.navigate("EditProfile");
  }, [navigation]);

  const openPremiumBenefits = useCallback(() => {
    const rootNavigation = navigation as unknown as NativeStackNavigationProp<RootStackParamList>;
    rootNavigation.navigate("PremiumBenefits");
  }, [navigation]);

  useEffect(() => {
    const shouldOpenProfileEdit =
      guidedTourActive &&
      isViewingOwnProfile &&
      guidedTourStepKey === "profile-edit-dialog";

    if (!shouldOpenProfileEdit) {
      profileEditRouteOpenedRef.current = false;
      return;
    }

    if (profileEditRouteOpenedRef.current) {
      return;
    }

    profileEditRouteOpenedRef.current = true;
    openProfileEdit();
  }, [guidedTourActive, guidedTourStepKey, isViewingOwnProfile, openProfileEdit]);

  const handleCreateOrUpdatePost = async (content: string) => {
    if (editingPost?._id) {
      await updatePostMutation.mutateAsync({ postId: editingPost._id, content });
      setEditingPost(null);
      return;
    }

    await createPostMutation.mutateAsync(content);
  };

  const handleDeletePost = (postId: string) => {
    Alert.alert("Gurungni o'chirish", "Haqiqatan ham o'chirmoqchimisiz?", [
      { text: "Bekor qilish", style: "cancel" },
      {
        text: "O'chirish",
        style: "destructive",
        onPress: () => {
          deletePostMutation.mutate(postId);
        },
      },
    ]);
  };

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleOpenSupportChat = async (username: string) => {
    try {
      const users = await usersApi.searchGlobal(username);
      const supportUser = users.find(
        (item) => String(item.username || "").toLowerCase() === username.toLowerCase(),
      );

      if (!supportUser) {
        throw new Error(t("profileUtility.support.chatError"));
      }

      const privateChat = await chatsApi.createChat({
        isGroup: false,
        memberIds: [getEntityId(supportUser)],
      });

      queryClient.setQueryData<ChatSummary[]>(["chats"], (current) => {
        const next = Array.isArray(current) ? [...current] : [];
        const chatId = getEntityId(privateChat);
        const existingIndex = next.findIndex((item) => getEntityId(item) === chatId);
        if (existingIndex >= 0) {
          next.splice(existingIndex, 1);
        }
        next.unshift(privateChat);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["chats"] });

      navigation.push("ChatRoom", {
        chatId: getEntityId(privateChat),
        title: supportUser.nickname || supportUser.username || username,
        isGroup: false,
      } as never);
    } catch (error) {
      Alert.alert(
        t("profile.tabs.support"),
        error instanceof Error ? error.message : t("profileUtility.support.chatError"),
      );
    }
  };

  const followMutation = useMutation({
    mutationFn: async () => {
      const targetIdentifier = requestedProfileIdentifier || profileUserId;
      if (!targetIdentifier) {
        throw new Error("Foydalanuvchi topilmadi.");
      }
      return usersApi.toggleFollow(targetIdentifier);
    },
    onSuccess: ({ following, followersCount }) => {
      if (!requestedProfileIdentifier) {
        return;
      }

      queryClient.setQueryData<User | undefined>(
        ["public-profile", requestedProfileIdentifier],
        (previous) =>
          previous
            ? {
                ...previous,
                isFollowing: following,
                followersCount,
              }
            : previous,
      );
    },
    onError: (error) => {
      Alert.alert(
        "Obuna yangilanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
  });

  const handleToggleFollow = useCallback(() => {
    if (isViewingOwnProfile || followMutation.isPending) {
      return;
    }

    followMutation.mutate();
  }, [followMutation, isViewingOwnProfile]);

  const handleOpenDirectMessage = useCallback(async () => {
    const targetUserId = getEntityId(displayUser);
    if (!targetUserId) {
      Alert.alert("Xabar ochilmadi", "Foydalanuvchi topilmadi.");
      return;
    }

    try {
      const privateChat = await chatsApi.createChat({
        isGroup: false,
        memberIds: [targetUserId],
      });

      queryClient.setQueryData<ChatSummary[]>(["chats"], (current) => {
        const next = Array.isArray(current) ? [...current] : [];
        const chatId = getEntityId(privateChat);
        const existingIndex = next.findIndex((item) => getEntityId(item) === chatId);
        if (existingIndex >= 0) {
          next.splice(existingIndex, 1);
        }
        next.unshift(privateChat);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["chats"] });

      navigation.push("ChatRoom", {
        chatId: getEntityId(privateChat),
        title:
          displayUser?.nickname ||
          displayUser?.username ||
          "Foydalanuvchi",
        isGroup: false,
      } as never);
    } catch (error) {
      Alert.alert(
        "Xabar ochilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    }
  }, [displayUser, navigation, queryClient]);

  const handleDeleteFeedStorage = (entryId: string) => {
    Alert.alert(
      "Rasmni o'chirish",
      "Keshlangan rasm qurilma xotirasidan o'chiriladi.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profileUtility.storage.deleteAction"),
          style: "destructive",
          onPress: () => {
            deleteFeedStorageMutation.mutate(entryId);
          },
        },
      ],
    );
  };

  const handleDeleteCourseVideoStorage = (entryId: string) => {
    Alert.alert(
      t("profileUtility.storage.deleteVideoTitle"),
      t("profileUtility.storage.deleteVideoDescription"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profileUtility.storage.deleteAction"),
          style: "destructive",
          onPress: () => {
            deleteCourseVideoStorageMutation.mutate(entryId);
          },
        },
      ],
    );
  };

  const handleClearFeedStorage = () => {
    Alert.alert(
      "Rasmlar keshini tozalash",
      "Avatarlar, chat rasmlari, maqola coverlari, kurs rasmlari va boshqa keshlangan rasmlar o'chiriladi.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Rasmlarni tozalash",
          style: "destructive",
          onPress: () => {
            clearFeedStorageMutation.mutate();
          },
        },
      ],
    );
  };

  const handleClearCourseVideoStorage = () => {
    Alert.alert(
      t("profileUtility.storage.clearVideosTitle"),
      t("profileUtility.storage.clearVideosDescription"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profileUtility.storage.clearVideosAction"),
          style: "destructive",
          onPress: () => {
            clearCourseVideoStorageMutation.mutate();
          },
        },
      ],
    );
  };

  const handleClearAllStorage = () => {
    Alert.alert(
      t("profileUtility.storage.clearAllTitle"),
      t("profileUtility.storage.clearAllDescription"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profileUtility.storage.clearAllAction"),
          style: "destructive",
          onPress: async () => {
            await Promise.all([
              clearFeedStorageMutation.mutateAsync(),
              clearCourseVideoStorageMutation.mutateAsync(),
            ]);
          },
        },
      ],
    );
  };

  const handleProfileSaved = async (updatedUser: User) => {
    setUser(updatedUser);
    await queryClient.invalidateQueries({ queryKey: ["profile-decorations"] });
    await queryClient.invalidateQueries({ queryKey: ["liked-posts"] });
    await queryClient.invalidateQueries({ queryKey: ["liked-articles"] });
  };

  const openPane = (tab: Exclude<ProfileTab, null>) => {
    navigation.push(PROFILE_PANE_ROUTES[tab], {
      userId: requestedUserId || null,
      jammId: requestedJammId || null,
    } as never);
  };

  const closePane = () => {
    if (!forcedTab && requestedProfileIdentifier && !isViewingOwnProfile) {
      const tabNavigation = navigation as Props["navigation"];
      const rootNavigation =
        navigation as NativeStackScreenProps<RootStackParamList>["navigation"];

      tabNavigation.setParams?.({
        userId: undefined,
        jammId: undefined,
        returnTo: undefined,
      } as never);
      rootNavigation.navigate("MainTabs", {
        screen: requestedReturnTo,
      } as never);
      return;
    }

    if (forcedTab) {
      navigation.goBack();
      return;
    }

    navigation.goBack();
  };

  const openFeedTab = () => {
    const rootNavigation =
      navigation as NativeStackScreenProps<RootStackParamList>["navigation"];
    rootNavigation.navigate("MainTabs", { screen: "Feed" } as never);
  };

  useEffect(() => {
    if (forcedTab || !requestedProfileIdentifier || isViewingOwnProfile) {
      return undefined;
    }

    const removableNavigation = navigation as Props["navigation"];
    const unsubscribe = removableNavigation.addListener("beforeRemove", (event: any) => {
      const actionType = event.data.action?.type;
      if (actionType !== "GO_BACK" && actionType !== "POP" && actionType !== "POP_TO_TOP") {
        return;
      }

      event.preventDefault();
      closePane();
    });

    return unsubscribe;
  }, [closePane, forcedTab, isViewingOwnProfile, navigation, requestedProfileIdentifier]);

  useFocusEffect(
    useCallback(() => {
      if (forcedTab) {
        return undefined;
      }

      const timeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          resetOverviewScroll();
        });
      }, 0);

      return () => {
        clearTimeout(timeoutId);
      };
    }, [forcedTab, resetOverviewScroll]),
  );

  useEffect(() => {
    if (forcedTab) {
      return undefined;
    }

    const tabNavigation = navigation as Props["navigation"];
    const unsubscribe = tabNavigation.addListener("tabPress", () => {
      requestAnimationFrame(() => {
        resetOverviewScroll();
      });
    });

    return unsubscribe;
  }, [forcedTab, navigation, resetOverviewScroll]);

  const renderOverview = () => (
    <Animated.ScrollView
      ref={overviewScrollRef as any}
      style={styles.overviewScroll}
      contentContainerStyle={styles.overviewContent}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: profileScrollY } } }],
        { useNativeDriver: true },
      )}
    >
      <GuidedTourTarget targetKey="profile-overview">
        <Animated.View
          style={[
            styles.profileSummary,
            {
              opacity: summaryOpacity,
              transform: [{ translateY: summaryTranslateY }, { scale: summaryScale }],
            },
          ]}
        >
        <Animated.View
          style={[
            styles.cover,
            { transform: [{ translateY: coverTranslateY }] },
          ]}
        >
          <View style={styles.coverShade} />
          {isViewingOwnProfile ? (
            <GuidedTourTarget targetKey="profile-edit-trigger">
              <Pressable
                style={styles.coverAction}
                onPress={openProfileEdit}
              >
                <Pencil size={15} color="#fff" />
              </Pressable>
            </GuidedTourTarget>
          ) : null}
        </Animated.View>

        <Animated.View
          style={[
            styles.avatarWrap,
            {
              transform: [{ translateY: avatarTranslateY }, { scale: avatarScale }],
            },
          ]}
        >
          <Avatar
            label={displayUser?.nickname || displayUser?.username || "User"}
            uri={displayUser?.avatar}
            size={76}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.infoBlock,
            { transform: [{ translateY: infoTranslateY }] },
          ]}
        >
          <UserDisplayName
            user={displayUser}
            fallback={displayUser?.nickname || displayUser?.username || "Foydalanuvchi"}
            size="lg"
            textStyle={styles.displayName}
            containerStyle={styles.displayNameWrap}
          />
          <Text style={styles.handle}>@{displayUser?.username || "user"}</Text>
          <Text style={styles.bio}>
            {displayUser?.bio ||
              (isViewingOwnProfile
                ? t("profile.bioMissingOwn")
                : t("profile.bioMissingOther"))}
          </Text>
          <View style={styles.metaRow}>
            <Calendar size={13} color={Colors.mutedText} />
            <Text style={styles.metaText}>
              {formatJoinedDate(displayUser?.createdAt) || "Jamm"}
            </Text>
          </View>
        </Animated.View>
        </Animated.View>

        <View style={styles.statsCard}>
          {stats.map((item, index) => (
            <View
              key={item.label}
              style={[styles.statItem, index === stats.length - 1 && styles.statItemLast]}
            >
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {!isViewingOwnProfile ? (
          <View style={styles.publicProfileActions}>
            <Pressable
              style={[
                styles.primaryButton,
                styles.publicProfileActionPrimary,
                followMutation.isPending && styles.primaryButtonDisabled,
              ]}
              disabled={followMutation.isPending}
              onPress={handleToggleFollow}
            >
              {followMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : displayUser?.isFollowing ? (
                <UserCheck size={16} color="#fff" />
              ) : (
                <UserPlus size={16} color="#fff" />
              )}
              <Text style={styles.primaryButtonText}>
                {displayUser?.isFollowing ? "Obuna bo'lingan" : "Obuna bo'lish"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, styles.publicProfileActionSecondary]}
              onPress={() => void handleOpenDirectMessage()}
            >
              <MessageSquare size={16} color={Colors.text} />
              <Text style={styles.secondaryButtonText}>{t("common.contact")}</Text>
            </Pressable>
          </View>
        ) : null}
      </GuidedTourTarget>

      <View style={styles.tabRailContent}>
        <View style={styles.tabCard}>
          {PRIMARY_TABS.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            const targetKey = PROFILE_TAB_TOUR_KEYS[item.key];
            const row = (
              <Pressable
                key={item.key}
                style={[styles.tabRow, isActive && styles.tabRowActive]}
                onPress={() => openPane(item.key)}
              >
                <View
                  style={[
                    styles.tabIcon,
                    isActive ? styles.tabIconActive : null,
                  ]}
                >
                  <Icon size={15} color={isActive ? Colors.text : Colors.mutedText} />
                </View>
                <Text style={styles.tabLabel}>{t(item.labelKey)}</Text>
                <ChevronRight size={16} color={Colors.subtleText} style={styles.tabChevron} />
                {index < PRIMARY_TABS.length - 1 ? <View style={styles.tabDivider} /> : null}
              </Pressable>
            );
            return (
              targetKey ? (
                <GuidedTourTarget key={item.key} targetKey={targetKey}>
                  {row}
                </GuidedTourTarget>
              ) : (
                row
              )
            );
          })}
        </View>

        {isViewingOwnProfile ? (
          <>
            <View style={styles.tabCard}>
              {UTILITY_TABS.map((item, index) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                const targetKey = PROFILE_TAB_TOUR_KEYS[item.key];
                const row = (
                  <Pressable
                    key={item.key}
                    style={[styles.tabRow, isActive && styles.tabRowActive]}
                    onPress={() => openPane(item.key)}
                  >
                    <View
                      style={[
                        styles.tabIcon,
                        isActive ? styles.tabIconActive : null,
                      ]}
                    >
                      <Icon size={15} color={isActive ? Colors.text : Colors.mutedText} />
                    </View>
                    <Text style={styles.tabLabel}>{t(item.labelKey)}</Text>
                    <ChevronRight size={16} color={Colors.subtleText} style={styles.tabChevron} />
                    {index < UTILITY_TABS.length - 1 ? <View style={styles.tabDivider} /> : null}
                  </Pressable>
                );
                return (
                  targetKey ? (
                    <GuidedTourTarget key={item.key} targetKey={targetKey}>
                      {row}
                    </GuidedTourTarget>
                  ) : (
                    row
                  )
                );
              })}
            </View>

            <View style={styles.footerCard}>
              <View style={styles.footerRow}>
                <View style={styles.footerMeta}>
                  <Text style={styles.footerTitle}>App version</Text>
                  <Text style={styles.footerSubtitle}>Current production version</Text>
                </View>
                <Text style={styles.versionBadge}>v{APP_VERSION}</Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.footerRow,
                  pressed && !loggingOut ? styles.footerRowPressed : null,
                  loggingOut ? styles.footerRowDisabled : null,
                ]}
                disabled={loggingOut}
                onPress={handleLogout}
              >
                <View style={styles.footerMeta}>
                  <Text style={styles.footerTitle}>Log out</Text>
                  <Text style={styles.footerSubtitle}>Sign out from this device</Text>
                </View>
                <View style={styles.logoutBadge}>
                  {loggingOut ? (
                    <ActivityIndicator size="small" color={Colors.danger} />
                  ) : (
                    <LogOut size={14} color={Colors.danger} />
                  )}
                  <Text style={styles.logoutBadgeText}>Log out</Text>
                </View>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </Animated.ScrollView>
  );

  const renderPostsPane = () => {
    const posts = postsQuery.data || [];

    return (
      <View style={styles.paneBody}>
        {postsQuery.isLoading ? (
          <View style={styles.loaderState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : posts.length === 0 ? (
          <EmptyPane
            icon={<MessageSquare size={26} color={Colors.mutedText} />}
            title="Hali gurung yo'q"
            description={
                 "Birinchi gurungingizni yozishingiz mumkin."
            }
          />
        ) : (
          <ScrollView
            style={styles.paneScroll}
            contentContainerStyle={styles.postsPaneContent}
            showsVerticalScrollIndicator={false}
          >
            {posts.map((post) => (
              <View key={post._id} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Avatar
                    label={displayUser?.nickname || displayUser?.username || "User"}
                    uri={displayUser?.avatar}
                    size={34}
                  />
                  <View style={styles.postMeta}>
                    <UserDisplayName
                      user={displayUser}
                      fallback={displayUser?.nickname || displayUser?.username || "User"}
                      size="sm"
                      textStyle={styles.postAuthor}
                    />
                    <Text style={styles.postDate}>{formatPostDate(post.createdAt)}</Text>
                  </View>
                </View>

                <Text style={styles.postContent}>{post.content}</Text>
                <ProfilePostImages images={post.images} />

                <View style={styles.postActions}>
                  <Pressable
                    style={styles.postAction}
                    onPress={() => likePostMutation.mutate(post._id)}
                  >
                    <Heart
                      size={15}
                      color={post.liked ? Colors.danger : Colors.mutedText}
                      fill={post.liked ? Colors.danger : "transparent"}
                    />
                    <Text
                      style={[
                        styles.postActionText,
                        post.liked && { color: Colors.danger },
                      ]}
                    >
                      {post.likes}
                    </Text>
                  </Pressable>
                  <View style={styles.postAction}>
                    <Ionicons
                      name="chatbubble-outline"
                      size={15}
                      color={Colors.mutedText}
                    />
                    <Text style={styles.postActionText}>{post.comments}</Text>
                  </View>
                  <View style={styles.postAction}>
                    <Eye size={15} color={Colors.mutedText} />
                    <Text style={styles.postActionText}>{post.views}</Text>
                  </View>
                </View>

                {isViewingOwnProfile ? (
                  <View style={styles.ownerActions}>
                    <Pressable
                      style={styles.ownerAction}
                      onPress={() => {
                        setEditingPost(post);
                        setComposerOpen(true);
                      }}
                    >
                      <Pencil size={14} color={Colors.mutedText} />
                      <Text style={styles.ownerActionText}>Tahrirlash</Text>
                    </Pressable>
                    <Pressable
                      style={styles.ownerAction}
                      onPress={() => handleDeletePost(post._id)}
                    >
                      <Trash2 size={14} color={Colors.danger} />
                      <Text style={[styles.ownerActionText, { color: Colors.danger }]}>
                        O'chirish
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderArticlesPane = () => {
    const items = articlesQuery.data || [];

    return (
      <View style={styles.paneBody}>
        {articlesQuery.isLoading ? (
          <View style={styles.loaderState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <EmptyPane
            icon={<Newspaper size={26} color={Colors.mutedText} />}
            title="Maqolalar topilmadi"
            description="Siz yozgan maqolalar shu yerda ko'rinadi."
          />
        ) : (
          <ScrollView
            style={styles.paneScroll}
            contentContainerStyle={styles.genericPaneContent}
            showsVerticalScrollIndicator={false}
          >
            {items.map((article: ProfileArticle) => (
              <View key={article._id} style={styles.articleCard}>
                {article.coverImage ? (
                  <PersistentCachedImage
                    remoteUri={article.coverImage}
                    style={styles.articleCover}
                  />
                ) : null}
                <View style={styles.articleBody}>
                  <Text style={styles.articleTitle}>{article.title}</Text>
                  <Text style={styles.articleExcerpt} numberOfLines={3}>
                    {article.excerpt || "Qisqacha mazmun mavjud emas."}
                  </Text>
                  <View style={styles.articleStats}>
                    <Text style={styles.articleStat}>{article.views || 0} view</Text>
                    <Text style={styles.articleStat}>{article.likes || 0} like</Text>
                    <Text style={styles.articleStat}>{article.comments || 0} comment</Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderCoursesPane = () => (
    <View style={styles.paneBody}>
      {coursesQuery.isLoading ? (
        <View style={styles.loaderState}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : ownedCourses.length === 0 ? (
        <EmptyPane
          icon={<GraduationCap size={26} color={Colors.mutedText} />}
          title="Darslar yo'q"
          description={
            isViewingOwnProfile
              ? "Siz yaratgan kurslar shu yerda ko'rinadi."
              : "Bu foydalanuvchi yaratgan kurslar shu yerda ko'rinadi."
          }
        />
      ) : (
        <ScrollView
          style={styles.paneScroll}
          contentContainerStyle={styles.courseGrid}
          showsVerticalScrollIndicator={false}
        >
          {ownedCourses.map((course: CourseItem) => (
            <View key={course._id || course.id} style={styles.courseCard}>
              {course.image ? (
                <PersistentCachedImage
                  remoteUri={course.image}
                  style={styles.courseThumb}
                />
              ) : (
                <View style={styles.courseThumbFallback}>
                  <Text style={styles.courseThumbFallbackText}>
                    {(course.name || "?").charAt(0)}
                  </Text>
                </View>
              )}
              <View style={styles.courseCardBody}>
                <Text style={styles.courseTitle}>{course.name}</Text>
                <Text style={styles.courseMeta}>
                  {course.lessonCount || (course.lessons || []).length || 0} ta dars
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderAppearancePane = () => {
    return (
      <ScrollView
        style={styles.paneScroll}
        contentContainerStyle={styles.genericPaneContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.utilityGroup}>
          <View style={styles.utilityGroupHeader}>
            <Text style={styles.utilityGroupTitle}>{t("profileUtility.appearance.groupTitle")}</Text>
            <Text style={styles.utilityGroupDescription}>
              {t("profileUtility.appearance.groupDescription")}
            </Text>
          </View>
          <View style={styles.utilitySettingRow}>
            <View style={styles.utilitySettingMeta}>
              <Text style={styles.utilitySettingStrong}>
                {t("profileUtility.appearance.themeLabel")}
              </Text>
              <Text style={styles.utilitySettingDescription}>
                {t("profileUtility.appearance.themeDescription")}
              </Text>
            </View>
            <Pressable
              style={styles.utilitySelect}
              onPress={() => setUtilitySelectionSheet("theme")}
            >
              <Text style={styles.utilitySelectText}>{currentThemeLabel}</Text>
              <ChevronDown size={14} color={Colors.mutedText} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderStoragePane = () => {
    const storageUsage = storageUsageQuery.data;
    const feedImages = storageUsage?.feedImages || [];
    const courseVideos = storageUsage?.courseVideos || [];
    const hasCachedItems = (storageUsage?.totals.allBytes || 0) > 0;
    const storageBusy =
      deleteFeedStorageMutation.isPending ||
      clearFeedStorageMutation.isPending ||
      deleteCourseVideoStorageMutation.isPending ||
      clearCourseVideoStorageMutation.isPending;

    return (
      <ScrollView
        style={styles.paneScroll}
        contentContainerStyle={styles.genericPaneContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.utilityStack}>
          <View style={styles.storageHeroCard}>
            {storageUsageQuery.isLoading ? (
              <View style={styles.utilityLoadingPanel}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : (
              <>
                <View style={styles.storageHeroTop}>
                  <View style={styles.storageHeroTitleWrap}>
                    <View style={styles.storageHeroIcon}>
                      <HardDrive size={18} color={Colors.primary} />
                    </View>
                    <View style={styles.storageHeroCopy}>
                      <Text style={styles.storageHeroEyebrow}>
                        {t("profileUtility.storage.summaryTitle")}
                      </Text>
                      <Text style={styles.storageHeroTotal}>
                        {formatStorageBytes(storageUsage?.totals.allBytes)}
                      </Text>
                    </View>
                  </View>
                  {hasCachedItems ? (
                    <Pressable
                      style={[
                        styles.storageClearAllButton,
                        storageBusy && styles.primaryButtonDisabled,
                      ]}
                      disabled={storageBusy}
                      onPress={handleClearAllStorage}
                    >
                      <Trash2 size={14} color={Colors.danger} />
                      <Text style={styles.storageClearAllText} numberOfLines={1}>
                        {t("profileUtility.storage.clearAllAction")}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            )}
          </View>

          <View
            style={styles.storageSegmentedControl}
            onLayout={(event) => setStorageTabsWidth(event.nativeEvent.layout.width)}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.storageSegmentIndicator,
                storageTabsWidth > 0 && storagePagerWidth > 0
                  ? {
                      width: storageTabsWidth / 2,
                      transform: [
                        {
                          translateX: storageScrollX.interpolate({
                            inputRange: [0, storagePagerWidth],
                            outputRange: [0, storageTabsWidth / 2],
                            extrapolate: "clamp",
                          }),
                        },
                      ],
                    }
                  : null,
              ]}
            />
            <Pressable
              style={styles.storageSegmentButton}
              onPress={() => setStorageViewWithPager("images")}
            >
              <Text
                style={[
                  styles.storageSegmentText,
                  storageView === "images" && styles.storageSegmentTextActive,
                ]}
              >
                {t("profileUtility.storage.imagesTab")}
              </Text>
              {!!feedImages.length ? (
                <View
                  style={[
                    styles.storageSegmentBadge,
                    storageView === "images" && styles.storageSegmentBadgeActive,
                  ]}
                >
                  <Text style={styles.storageSegmentBadgeText}>{feedImages.length}</Text>
                </View>
              ) : null}
            </Pressable>

            <Pressable
              style={styles.storageSegmentButton}
              onPress={() => setStorageViewWithPager("videos")}
            >
              <Text
                style={[
                  styles.storageSegmentText,
                  storageView === "videos" && styles.storageSegmentTextActive,
                ]}
              >
                {t("profileUtility.storage.videosTab")}
              </Text>
              {!!courseVideos.length ? (
                <View
                  style={[
                    styles.storageSegmentBadge,
                    storageView === "videos" && styles.storageSegmentBadgeActive,
                  ]}
                >
                  <Text style={styles.storageSegmentBadgeText}>{courseVideos.length}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <View
            style={styles.storagePagerContainer}
            onLayout={(event) => setStoragePagerWidth(event.nativeEvent.layout.width)}
          >
            <Animated.ScrollView
              ref={storagePagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
              scrollEventThrottle={16}
              style={styles.storagePagerTrack}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: storageScrollX } } }],
                { useNativeDriver: false },
              )}
              onMomentumScrollEnd={(event) => {
                if (!storagePagerWidth) {
                  return;
                }

                const nextIndex = Math.round(
                  event.nativeEvent.contentOffset.x / storagePagerWidth,
                );
                const nextView = nextIndex > 0 ? "videos" : "images";
                if (nextView !== storageView) {
                  setStorageView(nextView);
                }
              }}
            >
              <View style={[styles.storagePagerPage, storagePagerWidth ? { width: storagePagerWidth } : null]}>
                <View style={styles.utilityGroup}>
                  <View style={styles.storageSectionHeader}>
                    <View style={styles.storageSectionTitleWrap}>
                      <Text style={styles.utilityGroupTitle}>Rasmlar keshi</Text>
                      <Text style={styles.utilityGroupDescription}>
                        Avatarlar, chat rasmlari, maqola coverlari, kurs rasmlari va boshqa app rasmlari.
                      </Text>
                    </View>
                    {feedImages.length ? (
                      <Pressable
                        style={[
                          styles.storageInlineAction,
                          storageBusy && styles.primaryButtonDisabled,
                        ]}
                        disabled={storageBusy}
                        onPress={handleClearFeedStorage}
                      >
                        <Trash2 size={13} color={Colors.danger} />
                        <Text style={styles.storageInlineActionText}>{t("profileUtility.storage.clearAllAction")}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.utilitySectionBody}>
                    {storageUsageQuery.isLoading ? (
                      <View style={styles.utilityLoadingPanel}>
                        <ActivityIndicator color={Colors.primary} />
                      </View>
                    ) : feedImages.length ? (
                      <View style={styles.storageImageGrid}>
                        {feedImages.map((item) => {
                          const updatedAt = formatStorageDate(item.modifiedAt);
                          return (
                            <View key={item.id} style={styles.storageImageCard}>
                              <View style={styles.storageImagePreviewWrap}>
                                <Image
                                  source={{ uri: item.localUri }}
                                  style={styles.storageImagePreview}
                                  contentFit="cover"
                                />
                                <View style={styles.storageImageBadge}>
                                  <Text style={styles.storageImageBadgeText}>
                                    {formatStorageBytes(item.sizeBytes)}
                                  </Text>
                                </View>
                                <Pressable
                                  style={styles.storageCardDelete}
                                  onPress={() => handleDeleteFeedStorage(item.id)}
                                >
                                  <Trash2 size={14} color="#fff" />
                                </Pressable>
                              </View>
                              {updatedAt ? (
                                <Text style={styles.storageImageMeta}>
                                  {t("profileUtility.storage.updatedAt", { date: updatedAt })}
                                </Text>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.storageEmptyCard}>
                        <ImageIcon size={22} color={Colors.subtleText} />
                        <Text style={styles.utilityEmptyText}>Keshlangan rasmlar yo'q.</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={[styles.storagePagerPage, storagePagerWidth ? { width: storagePagerWidth } : null]}>
                <View style={styles.utilityGroup}>
                  <View style={styles.storageSectionHeader}>
                    <View style={styles.storageSectionTitleWrap}>
                      <Text style={styles.utilityGroupTitle}>
                        {t("profileUtility.storage.courseVideosTitle")}
                      </Text>
                      <Text style={styles.utilityGroupDescription}>
                        {t("profileUtility.storage.courseVideosDescription")}
                      </Text>
                    </View>
                    {courseVideos.length ? (
                      <Pressable
                        style={[
                          styles.storageInlineAction,
                          storageBusy && styles.primaryButtonDisabled,
                        ]}
                        disabled={storageBusy}
                        onPress={handleClearCourseVideoStorage}
                      >
                        <Trash2 size={13} color={Colors.danger} />
                        <Text style={styles.storageInlineActionText}>{t("profileUtility.storage.clearAllAction")}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.utilitySectionBody}>
                    {storageUsageQuery.isLoading ? (
                      <View style={styles.utilityLoadingPanel}>
                        <ActivityIndicator color={Colors.primary} />
                      </View>
                    ) : courseVideos.length ? (
                      <View style={styles.storageVideoList}>
                        {courseVideos.map((item) => {
                          const courseTitle =
                            (item.courseId &&
                              storageLabels.courseNames.get(String(item.courseId))) ||
                            t("profileUtility.storage.unknownCourse");
                          const lessonTitle =
                            (item.lessonId &&
                              storageLabels.lessonTitles.get(String(item.lessonId))) ||
                            t("profileUtility.storage.unknownLesson");
                          const updatedAt = formatStorageDate(item.createdAt);

                          return (
                            <View key={item.id} style={styles.storageVideoCard}>
                              <View style={styles.storageVideoIconWrap}>
                                <Video size={18} color="#f59e0b" />
                              </View>
                              <View style={styles.storageVideoMeta}>
                                <Text style={styles.storageVideoTitle}>{lessonTitle}</Text>
                                <Text style={styles.storageVideoCourse}>{courseTitle}</Text>
                                <Text style={styles.storageVideoCaption}>
                                  {formatStorageBytes(item.sizeBytes)}
                                  {" · "}
                                  {String(item.streamType || "direct").toUpperCase()}
                                  {updatedAt ? ` · ${updatedAt}` : ""}
                                </Text>
                              </View>
                              <Pressable
                                style={styles.storageVideoDelete}
                                onPress={() => handleDeleteCourseVideoStorage(item.id)}
                              >
                                <Trash2 size={16} color={Colors.danger} />
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.storageEmptyCard}>
                        <Video size={22} color={Colors.subtleText} />
                        <Text style={styles.utilityEmptyText}>
                          {t("profileUtility.storage.emptyCourseVideos")}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </Animated.ScrollView>
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderLanguagePane = () => (
    <ScrollView
      style={styles.paneScroll}
      contentContainerStyle={styles.genericPaneContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.utilityGroup}>
        <View style={styles.utilityGroupHeader}>
          <Text style={styles.utilityGroupTitle}>{t("profileUtility.language.groupTitle")}</Text>
          <Text style={styles.utilityGroupDescription}>
            {t("profileUtility.language.groupDescription")}
          </Text>
        </View>

        <View style={styles.utilitySettingRow}>
          <View style={styles.utilitySettingMeta}>
            <Text style={styles.utilitySettingStrong}>
              {t("profileUtility.language.languageLabel")}
            </Text>
            <Text style={styles.utilitySettingDescription}>
              {t("profileUtility.language.languageDescription")}
            </Text>
          </View>
          <Pressable
            style={styles.utilitySelect}
            onPress={() => setUtilitySelectionSheet("language")}
          >
            <Text style={styles.utilitySelectText}>{currentLanguageLabel}</Text>
            <ChevronDown size={14} color={Colors.mutedText} />
          </Pressable>
        </View>

        <View style={styles.utilitySettingRow}>
          <View style={styles.utilitySettingMeta}>
            <Text style={styles.utilitySettingStrong}>
              {t("profileUtility.language.regionLabel")}
            </Text>
            <Text style={styles.utilitySettingDescription}>
              {t("profileUtility.language.regionDescription")}
            </Text>
          </View>
          <View style={styles.utilityBadge}>
            <Text style={styles.utilityBadgeText}>{t("common.global")}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderSecurityPane = () => (
    <ScrollView
      style={styles.paneScroll}
      contentContainerStyle={styles.genericPaneContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.utilityStack}>
        <View style={styles.utilityGroup}>
          <View style={styles.utilityGroupHeader}>
            <Text style={styles.utilityGroupTitle}>{t("profileUtility.security.statusTitle")}</Text>
            <Text style={styles.utilityGroupDescription}>
              {t("profileUtility.security.statusDescription")}
            </Text>
          </View>
          {appLockQuery.isLoading ? (
            <View style={styles.utilityLoadingRow}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.utilitySettingRow}>
              <View style={styles.utilitySettingMeta}>
                <Text style={styles.utilitySettingStrong}>
                  {t("profileUtility.security.appLockLabel")}
                </Text>
                <Text style={styles.utilitySettingDescription}>
                  {t("profileUtility.security.appLockMeta")}
                </Text>
              </View>
              <View
                style={[
                  styles.utilityStatusBadge,
                  appLockQuery.data?.enabled && styles.utilityStatusBadgeActive,
                ]}
              >
                <Lock
                  size={14}
                  color={appLockQuery.data?.enabled ? "#faa61a" : Colors.primary}
                />
                <Text
                  style={[
                    styles.utilityStatusBadgeText,
                    appLockQuery.data?.enabled && styles.utilityStatusBadgeTextActive,
                  ]}
                >
                  {appLockQuery.data?.enabled
                    ? t("profileUtility.security.enabledBadge")
                    : t("profileUtility.security.disabledBadge")}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.utilitySettingRow}>
            <View style={styles.utilitySettingMeta}>
              <Text style={styles.utilitySettingStrong}>
                {t("profileUtility.security.groupInvitesLabel")}
              </Text>
              <Text style={styles.utilitySettingDescription}>
                {t("profileUtility.security.groupInvitesDescription")}
              </Text>
            </View>
            <Switch
              value={!user?.disableGroupInvites}
              onValueChange={(value) => {
                groupInvitePrivacyMutation.mutate(value);
              }}
              disabled={groupInvitePrivacyMutation.isPending}
              trackColor={{
                false: Colors.border,
                true: Colors.primary,
              }}
              thumbColor={Colors.background}
            />
          </View>
        </View>

        <View style={styles.utilityCardsGrid}>
          <View style={styles.utilityInfoCard}>
            <Text style={styles.utilityInfoCardTitle}>
              {t("profileUtility.security.passcodeTitle")}
            </Text>
            <Text style={styles.utilityInfoCardDescription}>
              {t("profileUtility.security.passcodeDescription")}
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                setSecurityModalMode(appLockQuery.data?.enabled ? "change" : "setup");
                setSecurityModalOpen(true);
              }}
            >
              <Lock size={14} color="#fff" />
              <Text style={styles.primaryButtonText}>
                {appLockQuery.data?.enabled
                  ? t("profileUtility.security.changeAction")
                  : t("profileUtility.security.enableAction")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.utilityInfoCard}>
            <Text style={styles.utilityInfoCardTitle}>
              {t("profileUtility.security.autoLockTitle")}
            </Text>
            <Text style={styles.utilityInfoCardDescription}>
              {t("profileUtility.security.autoLockDescription")}
            </Text>
            <Pressable
              style={[
                styles.dangerButton,
                !appLockQuery.data?.enabled && styles.primaryButtonDisabled,
              ]}
              disabled={!appLockQuery.data?.enabled}
              onPress={() => {
                setSecurityModalMode("disable");
                setSecurityModalOpen(true);
              }}
            >
              <Lock size={14} color={Colors.danger} />
              <Text style={styles.dangerButtonText}>
                {t("profileUtility.security.disableAction")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderPremiumPane = () => {
    const premiumActive = user?.premiumStatus === "active";
    const plans = (premiumPlansQuery.data || []).filter((plan) => plan.isActive !== false);
    const decorations = decorationsQuery.data || [];

    return (
      <ScrollView
        style={styles.paneScroll}
        contentContainerStyle={styles.genericPaneContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.utilityStack}>
          <View style={styles.utilityGroup}>
            <View style={styles.utilityGroupHeader}>
              <Text style={styles.utilityGroupTitle}>{t("profileUtility.premium.statusTitle")}</Text>
              <Text style={styles.utilityGroupDescription}>
                {t("profileUtility.premium.statusDescription")}
              </Text>
            </View>

            <View style={styles.utilitySettingRow}>
              <View style={styles.utilitySettingMeta}>
                <Text style={styles.utilitySettingStrong}>
                  {t("profileUtility.premium.statusLabel")}
                </Text>
                <Text style={styles.utilitySettingDescription}>
                  {t("profileUtility.premium.statusMeta")}
                </Text>
              </View>
              <View
                style={[
                  styles.utilityStatusBadge,
                  premiumActive && styles.utilityStatusBadgeActive,
                ]}
              >
                <Sparkles
                  size={14}
                  color={premiumActive ? "#faa61a" : Colors.primary}
                />
                <Text
                  style={[
                    styles.utilityStatusBadgeText,
                    premiumActive && styles.utilityStatusBadgeTextActive,
                  ]}
                >
                  {premiumActive ? t("common.active") : t("profileUtility.premium.freeAccount")}
                </Text>
              </View>
            </View>

            {!premiumActive ? (
              <View style={styles.utilitySettingRow}>
                <View style={styles.utilitySettingMeta}>
                  <Text style={styles.utilitySettingStrong}>
                    {t("profileUtility.premium.promoLabel")}
                  </Text>
                  <Text style={styles.utilitySettingDescription}>
                    {t("profileUtility.premium.promoDescription")}
                  </Text>
                </View>
                <View style={styles.utilityPromoRow}>
                  <TextInput
                    value={promoCode}
                    onChangeText={setPromoCode}
                    placeholder={t("profileUtility.premium.promoPlaceholder")}
                    placeholderTextColor={Colors.subtleText}
                    style={styles.utilityPromoInput}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <Pressable
                    style={[
                      styles.primaryButton,
                      (!promoCode.trim() || redeemPromoMutation.isPending) &&
                        styles.primaryButtonDisabled,
                    ]}
                    disabled={!promoCode.trim() || redeemPromoMutation.isPending}
                    onPress={() => redeemPromoMutation.mutate(promoCode.trim())}
                  >
                    {redeemPromoMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {t("common.activate")}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.utilitySettingRow}>
              <View style={styles.utilitySettingMeta}>
                <Text style={styles.utilitySettingStrong}>
                  {t("profileUtility.premium.aboutTitle")}
                </Text>
                <Text style={styles.utilitySettingDescription}>
                  {t("profileUtility.premium.aboutDescription")}
                </Text>
              </View>
              <Pressable
                style={styles.secondaryButton}
                onPress={openPremiumBenefits}
              >
                <Sparkles size={14} color={Colors.text} />
                <Text style={styles.secondaryButtonText}>
                  {t("profileUtility.premium.aboutAction")}
                </Text>
              </Pressable>
            </View>
          </View>

          {!premiumActive ? (
            <View style={styles.utilityGroup}>
              <View style={styles.utilityGroupHeader}>
                <Text style={styles.utilityGroupTitle}>{t("profileUtility.premium.plansTitle")}</Text>
                <Text style={styles.utilityGroupDescription}>
                  {t("profileUtility.premium.plansDescription")}
                </Text>
              </View>
              <View style={styles.utilitySectionBody}>
                {premiumPlansQuery.isLoading ? (
                  <View style={styles.utilityLoadingPanel}>
                    <ActivityIndicator color={Colors.primary} />
                  </View>
                ) : (
                  <View style={styles.utilityPlansGrid}>
                    {plans.map((plan: PremiumPlan) => (
                      <View
                        key={plan._id || plan.id || plan.name}
                        style={[styles.utilityPlanCard, styles.utilityPlanCardPremium]}
                      >
                        <Text style={styles.utilityPlanName}>{plan.name}</Text>
                        <Text style={styles.utilityPlanPrice}>${plan.price}</Text>
                        <Text style={styles.utilityPlanMeta}>
                          {plan.durationInDays} {t("profileUtility.premium.days")}
                        </Text>
                        <Pressable
                          style={styles.primaryButton}
                          onPress={() => void handleOpenSupportChat("premium")}
                        >
                          <Text style={styles.primaryButtonText}>
                            {t("profileUtility.premium.contactPremium")}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                    {!plans.length ? (
                      <View style={styles.utilityPlanCard}>
                        <Text style={styles.utilityPlanName}>Premium</Text>
                        <Text style={styles.utilityPlanMeta}>
                          {t("profileUtility.premium.plansUnavailable")}
                        </Text>
                        <Pressable
                          style={styles.primaryButton}
                          onPress={() => void handleOpenSupportChat("premium")}
                        >
                          <Text style={styles.primaryButtonText}>{t("common.contact")}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.utilityGroup}>
            <View style={styles.utilityGroupHeader}>
              <Text style={styles.utilityGroupTitle}>{t("profileUtility.premium.decorationTitle")}</Text>
              <Text style={styles.utilityGroupDescription}>
                {t("profileUtility.premium.decorationDescription")}
              </Text>
            </View>
            <View style={styles.utilitySectionBody}>
              {decorationsQuery.isLoading ? (
                <View style={styles.utilityLoadingPanel}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : (
                <View style={styles.decorationGrid}>
                  <Pressable
                    style={[
                      styles.decorationCard,
                      !user?.selectedProfileDecorationId && styles.decorationCardActive,
                    ]}
                    onPress={() => updateDecorationMutation.mutate(null)}
                  >
                    <View style={styles.decorationPreview}>
                      <Text style={styles.decorationEmoji}>•</Text>
                      <Text style={styles.decorationTitle}>
                        {t("profileUtility.premium.decorationNone")}
                      </Text>
                    </View>
                    <Text style={styles.decorationMeta}>
                      {t("profileUtility.premium.decorationNoneMeta")}
                    </Text>
                  </Pressable>

                  {decorations
                    .filter(
                      (item) => item?.key && item.key !== "custom-upload" && item.key !== "official-badge",
                    )
                    .map((decoration: ProfileDecoration) => {
                      const locked = Boolean(decoration.premiumOnly && !premiumActive);
                      const active = user?.selectedProfileDecorationId === decoration.key;

                      return (
                        <Pressable
                          key={decoration.key}
                          style={[
                            styles.decorationCard,
                            active && styles.decorationCardActive,
                            locked && styles.decorationCardLocked,
                          ]}
                          onPress={() => {
                            if (locked) {
                              void handleOpenSupportChat("premium");
                              return;
                            }
                            updateDecorationMutation.mutate(decoration.key);
                          }}
                        >
                          <View style={styles.decorationPreview}>
                            {decoration.key === "premium-badge" ? (
                              <View style={styles.decorationBadgeIconWrap}>
                                <PremiumBadgeIcon size={22} color="#ff4fb3" />
                              </View>
                            ) : (
                              <Text style={styles.decorationEmoji}>{decoration.emoji}</Text>
                            )}
                            <Text style={styles.decorationTitle}>{decoration.label}</Text>
                          </View>
                          <Text style={styles.decorationMeta}>
                            {locked
                              ? t("profileUtility.premium.decorationLockedDescription")
                              : t("profileUtility.premium.decorationBadgeMeta")}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderSupportPane = () => (
    <ScrollView
      style={styles.paneScroll}
      contentContainerStyle={styles.genericPaneContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.utilityCardsGrid}>
        <View style={styles.utilityInfoCard}>
          <Text style={styles.utilityInfoCardTitle}>
            {t("profileUtility.support.premiumTitle")}
          </Text>
          <Text style={styles.utilityInfoCardDescription}>
            {t("profileUtility.support.premiumDescription")}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => void handleOpenSupportChat("premium")}
          >
            <Text style={styles.primaryButtonText}>
              {t("profileUtility.support.premiumAction")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.utilityInfoCard}>
          <Text style={styles.utilityInfoCardTitle}>
            {t("profileUtility.support.jammTitle")}
          </Text>
          <Text style={styles.utilityInfoCardDescription}>
            {t("profileUtility.support.jammDescription")}
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void handleOpenSupportChat("jamm")}
          >
            <Text style={styles.secondaryButtonText}>
              {t("profileUtility.support.jammAction")}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );

  const renderFavoritesPane = () => (
    <ScrollView
      style={styles.paneScroll}
      contentContainerStyle={styles.genericPaneContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.utilityStack}>
        <View style={styles.utilityGroup}>
          <View style={styles.utilityGroupHeader}>
            <Text style={styles.utilityGroupTitle}>{t("profileUtility.favorites.lessonsTitle")}</Text>
            <Text style={styles.utilityGroupDescription}>
              {t("profileUtility.favorites.lessonsDescription")}
            </Text>
          </View>
          <View style={styles.utilitySectionBody}>
            {likedLessonsQuery.isLoading ? (
              <View style={styles.utilityLoadingPanel}>
                <Text style={styles.utilityEmptyText}>{t("common.loading")}</Text>
              </View>
            ) : (likedLessonsQuery.data || []).length ? (
              <View style={styles.utilityCardsGrid}>
                {(likedLessonsQuery.data || []).map((lesson: FavoriteLesson) => (
                  <Pressable
                    key={lesson._id}
                    style={styles.utilityFavoriteCard}
                    onPress={() =>
                      navigation.push("CourseDetail", {
                        courseId: lesson.course?.urlSlug || lesson.course?._id || "",
                        lessonId: lesson.urlSlug || lesson._id,
                      } as never)
                    }
                  >
                    <Text style={styles.utilityFavoriteTitle}>{lesson.title}</Text>
                    <Text style={styles.utilityFavoriteMeta}>
                      {lesson.course?.name || t("common.course")} {" · "} {lesson.likes || 0}{" "}
                      {t("common.like")} {" · "} {lesson.views || 0} {t("common.views")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.utilityLoadingPanel}>
                <Text style={styles.utilityEmptyText}>
                  {t("profileUtility.favorites.lessonsEmpty")}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.utilityGroup}>
          <View style={styles.utilityGroupHeader}>
            <Text style={styles.utilityGroupTitle}>{t("profileUtility.favorites.postsTitle")}</Text>
            <Text style={styles.utilityGroupDescription}>
              {t("profileUtility.favorites.postsDescription")}
            </Text>
          </View>
          <View style={styles.utilitySectionBody}>
            {likedPostsQuery.isLoading ? (
              <View style={styles.utilityLoadingPanel}>
                <Text style={styles.utilityEmptyText}>{t("common.loading")}</Text>
              </View>
            ) : (likedPostsQuery.data || []).length ? (
              <View style={styles.utilityCardsGrid}>
                {(likedPostsQuery.data || []).map((post) => (
                  <Pressable
                    key={post._id}
                    style={styles.utilityFavoriteCard}
                    onPress={openFeedTab}
                  >
                    <Text style={styles.utilityFavoriteTitle}>
                      {post.author?.nickname || post.author?.username || t("common.author")}
                    </Text>
                    <Text style={styles.utilityFavoriteMeta}>
                      {String(post.content || "").slice(0, 160)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.utilityLoadingPanel}>
                <Text style={styles.utilityEmptyText}>
                  {t("profileUtility.favorites.postsEmpty")}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.utilityGroup}>
          <View style={styles.utilityGroupHeader}>
            <Text style={styles.utilityGroupTitle}>{t("profileUtility.favorites.articlesTitle")}</Text>
            <Text style={styles.utilityGroupDescription}>
              {t("profileUtility.favorites.articlesDescription")}
            </Text>
          </View>
          <View style={styles.utilitySectionBody}>
            {likedArticlesQuery.isLoading ? (
              <View style={styles.utilityLoadingPanel}>
                <Text style={styles.utilityEmptyText}>{t("common.loading")}</Text>
              </View>
            ) : (likedArticlesQuery.data || []).length ? (
              <View style={styles.utilityCardsGrid}>
                {(likedArticlesQuery.data || []).map((article: ProfileArticle) => (
                  <Pressable
                    key={article._id}
                    style={styles.utilityFavoriteCard}
                    onPress={() =>
                      navigation.push("ArticleDetail", {
                        articleId: article.slug || article._id,
                      } as never)
                    }
                  >
                    <Text style={styles.utilityFavoriteTitle}>{article.title}</Text>
                    <Text style={styles.utilityFavoriteMeta}>
                      {t("common.author")} {" · "} {article.likes || 0} {t("common.like")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.utilityLoadingPanel}>
                <Text style={styles.utilityEmptyText}>
                  {t("profileUtility.favorites.articlesEmpty")}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderLearnPane = () => (
    <ScrollView
      style={styles.paneScroll}
      contentContainerStyle={styles.genericPaneContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.utilityCardsGrid}>
        <View style={styles.utilityInfoCard}>
          <Text style={styles.utilityInfoCardTitle}>{t("profileUtility.learn.title")}</Text>
          <Text style={styles.utilityInfoCardDescription}>
            {t("profileUtility.learn.description")}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              startGuidedTour("profile-overview");
              if (forcedTab) {
                navigation.goBack();
              }
            }}
          >
            <Sparkles size={14} color="#fff" />
            <Text style={styles.primaryButtonText}>{t("profileUtility.learn.start")}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );

  const renderActivePane = () => {
    switch (activeTab) {
      case "groups":
        return renderPostsPane();
      case "articles":
        return renderArticlesPane();
      case "courses":
        return renderCoursesPane();
      case "appearance":
        return renderAppearancePane();
      case "storage":
        return renderStoragePane();
      case "language":
        return renderLanguagePane();
      case "security":
        return renderSecurityPane();
      case "premium":
        return renderPremiumPane();
      case "support":
        return renderSupportPane();
      case "favorites":
        return renderFavoritesPane();
      case "learn":
        return renderLearnPane();
      default:
        return null;
    }
  };

  const activeTitle =
    (PRIMARY_TABS.find((item) => item.key === activeTab)?.labelKey
      ? t(PRIMARY_TABS.find((item) => item.key === activeTab)?.labelKey || "")
      : "") ||
    (UTILITY_TABS.find((item) => item.key === activeTab)?.labelKey
      ? t(UTILITY_TABS.find((item) => item.key === activeTab)?.labelKey || "")
      : "") ||
    t("navigation.profile");

  if (!displayUser && !isViewingOwnProfile && publicProfileQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loaderState}>
          <Text style={styles.emptyPaneTitle}>Profil topilmadi</Text>
          <Text style={styles.emptyPaneDescription}>
            Bu foydalanuvchi profili yuklanmadi.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!displayUser || (!isViewingOwnProfile && publicProfileQuery.isLoading)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loaderState}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        {forcedTab ? (
          <View style={styles.paneContainer}>
            <ProfilePaneHeader
              title={activeTitle}
              onBack={closePane}
              action={
                activeTab === "groups" && isViewingOwnProfile ? (
                  <Pressable
                    style={styles.paneHeaderButton}
                    onPress={() => {
                      setEditingPost(null);
                      setComposerOpen(true);
                    }}
                  >
                    <Plus size={18} color={Colors.text} />
                  </Pressable>
                ) : undefined
              }
            />
            {renderActivePane()}
          </View>
        ) : (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.collapsedHeader,
                { height: 56 },
              ]}
            >
              <Animated.View
                style={[
                  styles.collapsedHeaderBackdrop,
                  { opacity: headerBackdropOpacity },
                ]}
              />
              <Animated.View
                style={[
                  styles.collapsedHeaderContent,
                  {
                    opacity: headerProgress,
                    transform: [
                      { translateY: headerContentTranslateY },
                      { scale: headerContentScale },
                    ],
                  },
                ]}
              >
                <Avatar
                  label={displayUser?.nickname || displayUser?.username || "User"}
                  uri={displayUser?.avatar}
                  size={34}
                  shape="circle"
                />
                <Animated.View
                  style={[
                    styles.collapsedHeaderText,
                    { transform: [{ translateX: headerNameTranslateX }] },
                  ]}
                >
                  <UserDisplayName
                    user={displayUser}
                    fallback={displayUser?.nickname || displayUser?.username || "Foydalanuvchi"}
                    size="sm"
                    textStyle={styles.collapsedHeaderName}
                  />
                  <Animated.Text
                    style={[
                      styles.collapsedHeaderHandle,
                      { opacity: headerHandleOpacity },
                    ]}
                  >
                    @{displayUser?.username || "user"}
                  </Animated.Text>
                </Animated.View>
              </Animated.View>
            </Animated.View>

            {renderOverview()}
          </>
        )}
      </View>

     
      <SecurityPinModal
        visible={isViewingOwnProfile && securityModalOpen}
        mode={securityModalMode}
        loading={appLockMutation.isPending}
        onClose={() => setSecurityModalOpen(false)}
        onSubmit={async ({ currentPin, nextPin }) => {
          try {
            await appLockMutation.mutateAsync({
              currentPin,
              nextPin,
              mode: securityModalMode,
            });
          } catch (error) {
            Alert.alert(
              t("profileUtility.security.statusTitle"),
              error instanceof Error ? error.message : t("profileUtility.security.saveError"),
            );
          }
        }}
      />

      <Modal
        visible={utilitySelectionSheet !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setUtilitySelectionSheet(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setUtilitySelectionSheet(null)}
        >
          <Pressable
            style={styles.utilitySheetCard}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.utilitySheetHeader}>
              <Text style={styles.utilitySheetTitle}>{utilitySheetTitle}</Text>
              <Pressable
                style={styles.utilitySheetClose}
                onPress={() => setUtilitySelectionSheet(null)}
              >
                <X size={18} color={Colors.text} />
              </Pressable>
            </View>

            <View style={styles.utilitySheetList}>
              {utilitySheetOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.utilitySheetOption,
                    selectedUtilityValue === option.value && styles.utilitySheetOptionActive,
                  ]}
                  onPress={() => {
                    if (utilitySelectionSheet === "theme") {
                      void setTheme(option.value as "dark" | "light");
                    } else {
                      void setLanguage(option.value as "uz" | "ru" | "en");
                    }
                    setUtilitySelectionSheet(null);
                  }}
                >
                  <Text
                    style={[
                      styles.utilitySheetOptionText,
                      selectedUtilityValue === option.value &&
                        styles.utilitySheetOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selectedUtilityValue === option.value ? (
                    <Check size={16} color={Colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => setUtilitySelectionSheet(null)}
            >
              <Text style={styles.secondaryButtonText}>{t("common.cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

export function ProfileScreen({ navigation, route }: Props) {
  return (
    <ProfileScreenContent
      navigation={navigation}
      routeParams={route.params}
    />
  );
}

export function ProfileEditScreen({ navigation }: ProfileEditProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const handleProfileSaved = useCallback(
    async (updatedUser: User) => {
      setUser(updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["profile-decorations"] });
      await queryClient.invalidateQueries({ queryKey: ["liked-posts"] });
      await queryClient.invalidateQueries({ queryKey: ["liked-articles"] });
    },
    [queryClient, setUser],
  );

  return (
    <ProfileEditModal
      visible
      user={user}
      onClose={() => navigation.goBack()}
      onSaved={handleProfileSaved}
      asScreen
    />
  );
}

export function PremiumBenefitsScreen({ navigation }: PremiumBenefitsProps) {
  const { t } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const isPremiumActive = currentUser?.premiumStatus === "active";

  const formatChars = useCallback(
    (value: number) => t("premiumModal.chars", { count: value }),
    [t],
  );
  const formatWords = useCallback(
    (value: number) => t("premiumModal.words", { count: value }),
    [t],
  );

  const sections = useMemo<PremiumSection[]>(
    () => [
      {
        key: "posts",
        title: t("premiumModal.sections.posts.title"),
        description: t("premiumModal.sections.posts.description"),
        items: [
          {
            label: t("premiumModal.items.postsPerDay"),
            ordinary: APP_LIMITS.postsPerDay.ordinary,
            premium: APP_LIMITS.postsPerDay.premium,
          },
          {
            label: t("premiumModal.items.postCommentsPerPost"),
            ordinary: APP_LIMITS.postCommentsPerPost.ordinary,
            premium: APP_LIMITS.postCommentsPerPost.premium,
          },
          {
            label: t("premiumModal.items.postWords"),
            ordinary: formatWords(APP_LIMITS.postWords),
            premium: formatWords(APP_LIMITS.postWords),
          },
          {
            label: t("premiumModal.items.postCommentChars"),
            ordinary: formatChars(APP_LIMITS.postCommentChars),
            premium: formatChars(APP_LIMITS.postCommentChars),
          },
        ],
      },
      {
        key: "articles",
        title: t("premiumModal.sections.articles.title"),
        description: t("premiumModal.sections.articles.description"),
        items: [
          {
            label: t("premiumModal.items.articlesPerUser"),
            ordinary: APP_LIMITS.articlesPerUser.ordinary,
            premium: APP_LIMITS.articlesPerUser.premium,
          },
          {
            label: t("premiumModal.items.articleCommentsPerArticle"),
            ordinary: APP_LIMITS.articleCommentsPerArticle.ordinary,
            premium: APP_LIMITS.articleCommentsPerArticle.premium,
          },
          {
            label: t("premiumModal.items.articleImagesPerArticle"),
            ordinary: APP_LIMITS.articleImagesPerArticle.ordinary,
            premium: APP_LIMITS.articleImagesPerArticle.premium,
          },
          {
            label: t("premiumModal.items.articleWords"),
            ordinary: formatWords(APP_LIMITS.articleWords.ordinary),
            premium: formatWords(APP_LIMITS.articleWords.premium),
          },
          {
            label: t("premiumModal.items.articleTitleChars"),
            ordinary: formatChars(APP_LIMITS.articleTitleChars),
            premium: formatChars(APP_LIMITS.articleTitleChars),
          },
          {
            label: t("premiumModal.items.articleExcerptChars"),
            ordinary: formatChars(APP_LIMITS.articleExcerptChars),
            premium: formatChars(APP_LIMITS.articleExcerptChars),
          },
          {
            label: t("premiumModal.items.articleTagChars"),
            ordinary: `${APP_LIMITS.articleTagCount} × ${formatChars(APP_LIMITS.articleTagChars)}`,
            premium: `${APP_LIMITS.articleTagCount} × ${formatChars(APP_LIMITS.articleTagChars)}`,
          },
          {
            label: t("premiumModal.items.articleCommentChars"),
            ordinary: formatChars(APP_LIMITS.articleCommentChars),
            premium: formatChars(APP_LIMITS.articleCommentChars),
          },
        ],
      },
      {
        key: "groups",
        title: t("premiumModal.sections.groups.title"),
        description: t("premiumModal.sections.groups.description"),
        items: [
          {
            label: t("premiumModal.items.groupsCreated"),
            ordinary: APP_LIMITS.groupsCreated.ordinary,
            premium: APP_LIMITS.groupsCreated.premium,
          },
          {
            label: t("premiumModal.items.groupsJoined"),
            ordinary: APP_LIMITS.groupsJoined.ordinary,
            premium: APP_LIMITS.groupsJoined.premium,
          },
          {
            label: t("premiumModal.items.messageChars"),
            ordinary: formatChars(APP_LIMITS.messageChars),
            premium: formatChars(APP_LIMITS.messageChars),
          },
          {
            label: t("premiumModal.items.groupNameChars"),
            ordinary: formatChars(APP_LIMITS.groupNameChars),
            premium: formatChars(APP_LIMITS.groupNameChars),
          },
          {
            label: t("premiumModal.items.groupDescriptionChars"),
            ordinary: formatChars(APP_LIMITS.groupDescriptionChars),
            premium: formatChars(APP_LIMITS.groupDescriptionChars),
          },
        ],
      },
      {
        key: "meets",
        title: t("premiumModal.sections.meets.title"),
        description: t("premiumModal.sections.meets.description"),
        items: [
          {
            label: t("premiumModal.items.meetsCreated"),
            ordinary: APP_LIMITS.meetsCreated.ordinary,
            premium: APP_LIMITS.meetsCreated.premium,
          },
          {
            label: t("premiumModal.items.meetParticipants"),
            ordinary: APP_LIMITS.meetParticipants.ordinary,
            premium: APP_LIMITS.meetParticipants.premium,
          },
          {
            label: t("premiumModal.items.meetTitleChars"),
            ordinary: formatChars(APP_LIMITS.meetTitleChars),
            premium: formatChars(APP_LIMITS.meetTitleChars),
          },
          {
            label: t("premiumModal.items.meetDescriptionChars"),
            ordinary: formatChars(APP_LIMITS.meetDescriptionChars),
            premium: formatChars(APP_LIMITS.meetDescriptionChars),
          },
        ],
      },
      {
        key: "courses",
        title: t("premiumModal.sections.courses.title"),
        description: t("premiumModal.sections.courses.description"),
        items: [
          {
            label: t("premiumModal.items.coursesCreated"),
            ordinary: APP_LIMITS.coursesCreated.ordinary,
            premium: APP_LIMITS.coursesCreated.premium,
          },
          {
            label: t("premiumModal.items.lessonsPerCourse"),
            ordinary: APP_LIMITS.lessonsPerCourse.ordinary,
            premium: APP_LIMITS.lessonsPerCourse.premium,
          },
          {
            label: t("premiumModal.items.lessonVideosPerLesson"),
            ordinary: APP_LIMITS.lessonVideosPerLesson.ordinary,
            premium: APP_LIMITS.lessonVideosPerLesson.premium,
          },
          {
            label: t("premiumModal.items.lessonMediaBytes"),
            ordinary: formatPremiumMegabytes(APP_LIMITS.lessonMediaBytes),
            premium: formatPremiumMegabytes(APP_LIMITS.lessonMediaBytes),
          },
          {
            label: t("premiumModal.items.lessonTestsPerLesson"),
            ordinary: APP_LIMITS.lessonTestsPerLesson.ordinary,
            premium: APP_LIMITS.lessonTestsPerLesson.premium,
          },
          {
            label: t("premiumModal.items.lessonHomeworkPerLesson"),
            ordinary: APP_LIMITS.lessonHomeworkPerLesson.ordinary,
            premium: APP_LIMITS.lessonHomeworkPerLesson.premium,
          },
          {
            label: t("premiumModal.items.homeworkTextChars"),
            ordinary: formatChars(APP_LIMITS.homeworkTextChars),
            premium: formatChars(APP_LIMITS.homeworkTextChars),
          },
          {
            label: t("premiumModal.items.homeworkLinkChars"),
            ordinary: formatChars(APP_LIMITS.homeworkLinkChars),
            premium: formatChars(APP_LIMITS.homeworkLinkChars),
          },
          {
            label: t("premiumModal.items.homeworkPhotoBytes"),
            ordinary: formatPremiumMegabytes(APP_LIMITS.homeworkPhotoBytes),
            premium: formatPremiumMegabytes(APP_LIMITS.homeworkPhotoBytes),
          },
          {
            label: t("premiumModal.items.homeworkAudioBytes"),
            ordinary: formatPremiumMegabytes(APP_LIMITS.homeworkAudioBytes),
            premium: formatPremiumMegabytes(APP_LIMITS.homeworkAudioBytes),
          },
          {
            label: t("premiumModal.items.homeworkVideoBytes"),
            ordinary: formatPremiumMegabytes(APP_LIMITS.homeworkVideoBytes),
            premium: formatPremiumMegabytes(APP_LIMITS.homeworkVideoBytes),
          },
          {
            label: t("premiumModal.items.homeworkPdfBytes"),
            ordinary: formatPremiumMegabytes(APP_LIMITS.homeworkPdfBytes),
            premium: formatPremiumMegabytes(APP_LIMITS.homeworkPdfBytes),
          },
          {
            label: t("premiumModal.items.courseNameChars"),
            ordinary: formatChars(APP_LIMITS.courseNameChars),
            premium: formatChars(APP_LIMITS.courseNameChars),
          },
          {
            label: t("premiumModal.items.courseDescriptionChars"),
            ordinary: formatChars(APP_LIMITS.courseDescriptionChars),
            premium: formatChars(APP_LIMITS.courseDescriptionChars),
          },
          {
            label: t("premiumModal.items.lessonTitleChars"),
            ordinary: formatChars(APP_LIMITS.lessonTitleChars),
            premium: formatChars(APP_LIMITS.lessonTitleChars),
          },
          {
            label: t("premiumModal.items.lessonDescriptionChars"),
            ordinary: formatChars(APP_LIMITS.lessonDescriptionChars),
            premium: formatChars(APP_LIMITS.lessonDescriptionChars),
          },
        ],
      },
      {
        key: "arena",
        title: t("premiumModal.sections.arena.title"),
        description: t("premiumModal.sections.arena.description"),
        items: [
          {
            label: t("premiumModal.items.testsCreated"),
            ordinary: APP_LIMITS.testsCreated.ordinary,
            premium: APP_LIMITS.testsCreated.premium,
          },
          {
            label: t("premiumModal.items.testShareLinksPerTest"),
            ordinary: APP_LIMITS.testShareLinksPerTest.ordinary,
            premium: APP_LIMITS.testShareLinksPerTest.premium,
          },
          {
            label: t("premiumModal.items.flashcardsCreated"),
            ordinary: APP_LIMITS.flashcardsCreated.ordinary,
            premium: APP_LIMITS.flashcardsCreated.premium,
          },
          {
            label: t("premiumModal.items.sentenceBuildersCreated"),
            ordinary: APP_LIMITS.sentenceBuildersCreated.ordinary,
            premium: APP_LIMITS.sentenceBuildersCreated.premium,
          },
          {
            label: t("premiumModal.items.sentenceBuilderShareLinksPerDeck"),
            ordinary: APP_LIMITS.sentenceBuilderShareLinksPerDeck.ordinary,
            premium: APP_LIMITS.sentenceBuilderShareLinksPerDeck.premium,
          },
          {
            label: t("premiumModal.items.testTitleChars"),
            ordinary: formatChars(APP_LIMITS.testTitleChars),
            premium: formatChars(APP_LIMITS.testTitleChars),
          },
          {
            label: t("premiumModal.items.testDescriptionChars"),
            ordinary: formatChars(APP_LIMITS.testDescriptionChars),
            premium: formatChars(APP_LIMITS.testDescriptionChars),
          },
          {
            label: t("premiumModal.items.testQuestionChars"),
            ordinary: formatChars(APP_LIMITS.testQuestionChars),
            premium: formatChars(APP_LIMITS.testQuestionChars),
          },
          {
            label: t("premiumModal.items.testOptionChars"),
            ordinary: formatChars(APP_LIMITS.testOptionChars),
            premium: formatChars(APP_LIMITS.testOptionChars),
          },
          {
            label: t("premiumModal.items.flashcardSideChars"),
            ordinary: formatChars(APP_LIMITS.flashcardSideChars),
            premium: formatChars(APP_LIMITS.flashcardSideChars),
          },
          {
            label: t("premiumModal.items.sentenceBuilderPromptChars"),
            ordinary: formatChars(APP_LIMITS.sentenceBuilderPromptChars),
            premium: formatChars(APP_LIMITS.sentenceBuilderPromptChars),
          },
          {
            label: t("premiumModal.items.sentenceBuilderAnswerChars"),
            ordinary: formatChars(APP_LIMITS.sentenceBuilderAnswerChars),
            premium: formatChars(APP_LIMITS.sentenceBuilderAnswerChars),
          },
        ],
      },
      {
        key: "profile",
        title: t("premiumModal.sections.profile.title"),
        description: t("premiumModal.sections.profile.description"),
        items: [
          {
            label: t("premiumModal.items.nicknameChars"),
            ordinary: formatChars(APP_LIMITS.nicknameChars),
            premium: formatChars(APP_LIMITS.nicknameChars),
          },
          {
            label: t("premiumModal.items.usernameChars"),
            ordinary: formatChars(APP_LIMITS.usernameChars),
            premium: formatChars(APP_LIMITS.usernameChars),
          },
          {
            label: t("premiumModal.items.bioChars"),
            ordinary: formatChars(APP_LIMITS.bioChars),
            premium: formatChars(APP_LIMITS.bioChars),
          },
        ],
      },
    ],
    [formatChars, formatWords, t],
  );

  return (
    <SafeAreaView style={styles.premiumBenefitsSafeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.premiumBenefitsRoot}>
        <View style={styles.premiumBenefitsHeader}>
          <View style={styles.premiumBenefitsHero}>
            <View style={styles.premiumBenefitsHeroRow}>
              <PremiumBadgeIcon size={28} color="#ff4fb3" />
              <Text style={styles.premiumBenefitsTitle}>{t("premiumModal.title")}</Text>
            </View>
            <Text style={styles.premiumBenefitsSubtitle}>{t("premiumModal.subtitle")}</Text>
          </View>
          <Pressable style={styles.premiumBenefitsClose} onPress={() => navigation.goBack()}>
            <X size={18} color={Colors.text} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.premiumBenefitsScroll}
          contentContainerStyle={styles.premiumBenefitsContent}
          showsVerticalScrollIndicator={false}
        >
          {!isPremiumActive ? (
            <View style={styles.premiumBenefitsPlans}>
              <View style={styles.premiumPlanCard}>
                <Text style={styles.premiumPlanName}>{t("premiumModal.freePlan")}</Text>
                <Text style={styles.premiumPlanMeta}>{t("premiumModal.freePlanDescription")}</Text>
              </View>
              <View style={[styles.premiumPlanCard, styles.premiumPlanCardActive]}>
                <View style={styles.premiumPlanPremiumRow}>
                  <PremiumBadgeIcon size={18} color="#ff4fb3" />
                  <Text style={styles.premiumPlanNameActive}>{t("premiumModal.premiumPlan")}</Text>
                </View>
                <Text style={styles.premiumPlanMeta}>{t("premiumModal.premiumPlanDescription")}</Text>
              </View>
            </View>
          ) : null}

          {sections.map((section) => (
            <View key={section.key} style={styles.premiumSectionCard}>
              <View style={styles.premiumSectionHeader}>
                <Text style={styles.premiumSectionTitle}>{section.title}</Text>
                <Text style={styles.premiumSectionDescription}>{section.description}</Text>
              </View>

              <View style={styles.premiumTableHead}>
                <Text style={[styles.premiumTableHeadCell, styles.premiumTableLabelHead]}>
                  {t("premiumModal.columns.feature")}
                </Text>
                <Text style={styles.premiumTableHeadCell}>{t("premiumModal.columns.free")}</Text>
                <Text style={[styles.premiumTableHeadCell, styles.premiumTableHeadCellPremium]}>
                  {t("premiumModal.columns.premium")}
                </Text>
              </View>

              {section.items.map((item, index) => (
                <View
                  key={`${section.key}-${item.label}`}
                  style={[
                    styles.premiumTableRow,
                    index === section.items.length - 1 && styles.premiumTableRowLast,
                  ]}
                >
                  <Text style={styles.premiumTableLabel}>{item.label}</Text>
                  <Text style={styles.premiumTableValue}>{String(item.ordinary)}</Text>
                  <Text style={[styles.premiumTableValue, styles.premiumTableValuePremium]}>
                    {String(item.premium)}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          <Text style={styles.premiumFooterNote}>{t("premiumModal.footerNote")}</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

export function ProfilePaneScreen({ navigation, route }: ProfilePaneProps) {
  return (
    <ProfileScreenContent
      navigation={navigation}
      routeParams={route.params}
      forcedTab={PROFILE_PANE_SECTIONS_BY_ROUTE[route.name]}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  collapsedHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  collapsedHeaderBackdrop: {
    ...StyleSheet.absoluteFillObject,
    // backgroundColor: "rgba(10,12,18,0.18)",
  },
  collapsedHeaderContent: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(24, 28, 38, 0.86)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 10,
  },
  collapsedHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  collapsedHeaderName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  collapsedHeaderHandle: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 1,
  },
  profileSummary: {
    backgroundColor: Colors.background,
  },
  overviewScroll: {
    flex: 1,
  },
  overviewContent: {
    paddingBottom: 120,
  },

  cover: {
    height: 132,
    backgroundColor: Colors.primary,
    position: "relative",
  },
  coverShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  coverAction: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: {
    marginTop: -38,
    marginLeft: 18,
    width: 76,
    height: 76,
  },
  avatarEditBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  infoBlock: {
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  displayNameWrap: {
    alignItems: "flex-start",
  },
  displayName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  handle: {
    color: Colors.mutedText,
    fontSize: 13,
    marginTop: 4,
  },
  bio: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  metaText: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  statsCard: {
    flexDirection: "row",
    marginHorizontal: 18,
    marginTop: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    gap: 6,
  },
  statItemLast: {
    borderRightWidth: 0,
  },
  statValue: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  statLabel: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  publicProfileActions: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 18,
    marginTop: 14,
  },
  publicProfileActionPrimary: {
    flex: 1,
  },
  publicProfileActionSecondary: {
    flex: 1,
  },
  tabRailContent: {
    paddingBottom: 20,
  },
  tabCard: {
    marginHorizontal: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  tabRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    position: "relative",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tabRowActive: {
    backgroundColor: Colors.hover,
  },
  tabIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    flexShrink: 0,
  },
  tabIconActive: {
    backgroundColor: Colors.hover,
  },
  tabLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 18,
    paddingTop: 3,
    textAlign: "left",
  },
  tabChevron: {
    opacity: 0.5,
    marginTop: 5,
    flexShrink: 0,
  },
  tabDivider: {
    position: "absolute",
    left: 52,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.3,
  },
  footerCard: {
    marginHorizontal: 14,
    marginTop: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  footerRow: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  footerRowPressed: {
    backgroundColor: Colors.hover,
  },
  footerRowDisabled: {
    opacity: 0.7,
  },
  footerMeta: {
    flex: 1,
    gap: 2,
  },
  footerTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  footerSubtitle: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  versionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(88,101,242,0.08)",
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  logoutBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logoutBadgeText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  paneContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  paneOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 4,
    backgroundColor: Colors.background,
  },
  paneHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  paneHeaderButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  paneHeaderAction: {
    width: 44,
    alignItems: "flex-end",
  },
  paneTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  paneBody: {
    flex: 1,
  },
  paneScroll: {
    flex: 1,
  },
  postsPaneContent: {
    paddingBottom: 28,
  },
  genericPaneContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  loaderState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPane: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyPaneIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.55,
  },
  emptyPaneTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyPaneDescription: {
    color: Colors.mutedText,
    textAlign: "center",
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  postCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  postMeta: {
    flex: 1,
    minWidth: 0,
  },
  postAuthor: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  postDate: {
    color: Colors.mutedText,
    fontSize: 11,
    marginTop: 2,
  },
  postContent: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  profileImageCarousel: {
    marginTop: 12,
  },
  profileImageViewport: {
    width: "100%",
    aspectRatio: 1.25,
    borderRadius: 14,
    overflow: "hidden",
  },
  profileImageFill: {
    flex: 1,
    borderRadius: 14,
  },
  profileImageDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  profileImageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  profileImageDotActive: {
    width: 18,
    backgroundColor: Colors.primary,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 12,
  },
  postAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  postActionText: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  ownerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 10,
  },
  ownerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ownerActionText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },
  articleCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  articleCover: {
    width: "100%",
    aspectRatio: 1.8,
  },
  articleBody: {
    padding: 14,
    gap: 8,
  },
  articleTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  articleExcerpt: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
  articleStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  articleStat: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  courseGrid: {
    padding: 16,
    gap: 12,
  },
  courseCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  courseThumb: {
    width: "100%",
    height: 120,
  },
  courseThumbFallback: {
    width: "100%",
    height: 120,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  courseThumbFallbackText: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
  },
  courseCardBody: {
    padding: 12,
  },
  courseTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  courseMeta: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 4,
  },
  settingGroup: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  settingGroupTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  settingGroupText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
  utilityGroup: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  utilityGroupHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 1,
  },
  utilityGroupTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  utilityGroupDescription: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 12,
  },
  utilitySettingRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  utilityStack: {
    gap: 12,
  },
  utilitySettingMeta: {
    gap: 2,
  },
  utilitySettingStrong: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  utilitySettingDescription: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  utilitySelect: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  utilitySelectText: {
    color: Colors.text,
    fontSize: 12,
    flex: 1,
  },
  utilityBadge: {
    alignSelf: "flex-start",
    minHeight: 32,
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(88,101,242,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  utilityBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  utilityStatusBadge: {
    alignSelf: "flex-start",
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(88,101,242,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  utilityStatusBadgeActive: {
    backgroundColor: "rgba(250, 166, 26, 0.12)",
  },
  utilityStatusBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  utilityStatusBadgeTextActive: {
    color: "#faa61a",
  },
  utilityCardsGrid: {
    gap: 10,
  },
  utilityInfoCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 12,
  },
  utilityInfoCardTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  utilityInfoCardDescription: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  utilityPromoRow: {
    gap: 8,
  },
  utilityPromoInput: {
    minHeight: 44,
  },
  utilitySectionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  utilityPlansGrid: {
    gap: 10,
  },
  utilityPlanCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  utilityPlanCardPremium: {
    borderColor: "rgba(250, 166, 26, 0.35)",
    backgroundColor: "rgba(250,166,26,0.08)",
  },
  utilityPlanName: {
    color: "#faa61a",
    fontSize: 14,
    fontWeight: "700",
  },
  utilityPlanPrice: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  utilityPlanMeta: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  utilityLoadingRow: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  utilityLoadingPanel: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  utilityEmptyText: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  utilityFavoriteCard: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  utilityFavoriteTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  utilityFavoriteMeta: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  badgePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.input,
  },
  badgePillText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  decorationGrid: {
    gap: 10,
  },
  decorationCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: Colors.background,
    gap: 8,
  },
  decorationCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  decorationCardLocked: {
    opacity: 0.5,
  },
  decorationPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  decorationBadgeIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  decorationEmoji: {
    fontSize: 18,
  },
  decorationTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  decorationMeta: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  languageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  languageChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.input,
  },
  languageChipActive: {
    backgroundColor: Colors.primary,
  },
  languageChipText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  languageChipTextActive: {
    color: "#fff",
  },
  utilitySheetCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 14,
  },
  utilitySheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  utilitySheetTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  utilitySheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.input,
  },
  utilitySheetList: {
    gap: 8,
  },
  utilitySheetOption: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  utilitySheetOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  utilitySheetOptionText: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  utilitySheetOptionTextActive: {
    color: Colors.primary,
  },
  dangerButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  dangerButtonText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  settingLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  settingText: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(88,101,242,0.08)",
  },
  statusBadgeActive: {
    backgroundColor: "rgba(250,166,26,0.12)",
  },
  statusBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadgeTextActive: {
    color: Colors.warning,
  },
  supportCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  supportTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  supportText: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  favoriteRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  favoriteTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  favoriteMeta: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 2,
  },
  learnGrid: {
    flexDirection: "row",
    gap: 10,
  },
  learnCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  learnValue: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  learnLabel: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  storageHeroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 12,
  },
  storageHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  storageHeroTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  storageHeroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primarySoft,
  },
  storageHeroCopy: {
    flex: 1,
    gap: 2,
  },
  storageHeroEyebrow: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },
  storageHeroTotal: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  storageHeroDescription: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  storageClearAllButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(240, 71, 71, 0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    maxWidth: "100%",
  },
  storageClearAllText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  storageHeroStats: {
    flexDirection: "row",
    gap: 10,
  },
  storageStatPill: {
    flex: 1,
    minHeight: 64,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  storageStatLabel: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },
  storageStatLabelActive: {
    color: "#fff",
  },
  storageStatValue: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  storageStatValueActive: {
    color: "#fff",
  },
  storageSegmentedControl: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    minHeight: 50,
    position: "relative",
    justifyContent: "space-around",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    overflow: "hidden",
  },
  storageSegmentButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 11,
    zIndex: 1,
  },
  storageSegmentIndicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  storageSegmentText: {
    color: Colors.subtleText,
    fontSize: 14,
    fontWeight: "500",
  },
  storageSegmentTextActive: {
    color: Colors.text,
    fontWeight: "700",
  },
  storageSegmentBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primarySoft,
  },
  storageSegmentBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  storageSegmentBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  storagePagerContainer: {
    overflow: "hidden",
  },
  storagePagerTrack: {
    width: "100%",
    backgroundColor: "#2F3136",
  },
  storagePagerPage: {
    flex: 1,
  },
  storageSectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  storageSectionTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  storageInlineAction: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(240, 71, 71, 0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  storageInlineActionText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  storageEmptyCard: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.background,
    padding: 20,
  },
  storageSummaryGrid: {
    gap: 10,
  },
  storageSummaryCard: {
    padding: 12,
    borderRadius: 12,
    // borderWidth: 1,
    // borderColor: Colors.border,
    // backgroundColor: Colors.background,
    gap: 6,
  },
  storageSummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  storageSummaryIconTotal: {
    backgroundColor: Colors.primarySoft,
  },
  storageSummaryIconImages: {
    backgroundColor: "rgba(34, 197, 94, 0.14)",
  },
  storageSummaryIconVideos: {
    backgroundColor: "rgba(245, 158, 11, 0.14)",
  },
  storageSummaryTitle: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },
  storageSummarySize: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  storageSummaryMeta: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  storageImageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  storageImageCard: {
    width: "31.8%",
    gap: 6,
  },
  storageImagePreviewWrap: {
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.input,
    position: "relative",
  },
  storageImagePreview: {
    width: "100%",
    height: "100%",
  },
  storageImageBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.58)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  storageImageBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  storageCardDelete: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.56)",
    alignItems: "center",
    justifyContent: "center",
  },
  storageImageMeta: {
    color: Colors.mutedText,
    fontSize: 11,
    lineHeight: 16,
  },
  storageVideoList: {
    gap: 10,
  },
  storageVideoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  storageVideoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  storageVideoMeta: {
    flex: 1,
    gap: 2,
  },
  storageVideoTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  storageVideoCourse: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  storageVideoCaption: {
    color: Colors.subtleText,
    fontSize: 11,
    lineHeight: 16,
  },
  storageVideoDelete: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(240, 71, 71, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.34)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalOverlayStrong: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 14,
  },
  profileEditCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "88%",
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  profileEditScreenSafeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  profileEditScreenRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 12,
  },
  profileEditScreenTarget: {
    flex: 1,
  },
  profileEditCardScreen: {
    flex: 1,
    maxWidth: undefined,
    maxHeight: undefined,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: Colors.surface,
  },
  profileEditHeader: {
    minHeight: 60,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  profileEditTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  profileEditClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  profileEditBody: {
    flexGrow: 0,
  },
  profileEditBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 24,
  },
  profileEditAvatarWrap: {
    width: 92,
    height: 92,
    alignSelf: "flex-start",
    marginBottom: 22,
  },
  profileEditAvatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 46,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileEditField: {
    marginBottom: 18,
  },
  profileEditLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  profileEditLabel: {
    color: Colors.mutedText,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  profileEditInput: {
    width: "100%",
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
  },
  profileEditTextArea: {
    width: "100%",
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  profileEditCounterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  profileEditCounter: {
    color: Colors.mutedText,
    fontSize: 11,
  },
  profileEditCounterDanger: {
    color: Colors.danger,
  },
  profileEditPremiumBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(250,166,26,0.14)",
  },
  profileEditPremiumBadgeText: {
    color: "#faa61a",
    fontSize: 10,
    fontWeight: "700",
  },
  profileEditSaveBar: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    gap: 12,
  },
  profileEditSaveInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileEditStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  profileEditStatusText: {
    color: Colors.accent,
    fontSize: 13,
  },
  profileEditStatusTextError: {
    color: Colors.danger,
  },
  premiumBenefitsSafeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  premiumBenefitsRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  premiumBenefitsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  premiumBenefitsHero: {
    flex: 1,
    gap: 8,
  },
  premiumBenefitsHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  premiumBenefitsTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  premiumBenefitsSubtitle: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  premiumBenefitsClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  premiumBenefitsScroll: {
    flex: 1,
  },
  premiumBenefitsContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 14,
  },
  premiumBenefitsPlans: {
    flexDirection: "row",
    gap: 12,
  },
  premiumPlanCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 8,
  },
  premiumPlanCardActive: {
    borderColor: "rgba(255,79,179,0.38)",
    backgroundColor: "rgba(255,79,179,0.08)",
  },
  premiumPlanPremiumRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  premiumPlanName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  premiumPlanNameActive: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  premiumPlanMeta: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  premiumSectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  premiumSectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 4,
  },
  premiumSectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  premiumSectionDescription: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  premiumTableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.input,
  },
  premiumTableHeadCell: {
    width: 92,
    textAlign: "right",
    color: Colors.mutedText,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  premiumTableLabelHead: {
    flex: 1,
    width: undefined,
    textAlign: "left",
    paddingRight: 12,
  },
  premiumTableHeadCellPremium: {
    color: "#ff4fb3",
  },
  premiumTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  premiumTableRowLast: {
    borderBottomWidth: 0,
  },
  premiumTableLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    paddingRight: 12,
  },
  premiumTableValue: {
    width: 92,
    textAlign: "right",
    color: Colors.mutedText,
    fontSize: 13,
    fontWeight: "600",
  },
  premiumTableValuePremium: {
    color: Colors.text,
    fontWeight: "800",
  },
  premiumFooterNote: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  modalInput: {
    minHeight: 180,
    borderRadius: 14,
    backgroundColor: Colors.input,
    color: Colors.text,
    padding: 14,
    textAlignVertical: "top",
    fontSize: 15,
    lineHeight: 22,
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalCounter: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  modalCounterDanger: {
    color: Colors.danger,
  },
  securityModal: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 14,
  },
  securityHelp: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  securityError: {
    color: Colors.danger,
    fontSize: 12,
    lineHeight: 18,
    marginTop: -4,
  },
  securityInput: {
    height: 50,
    borderRadius: 12,
    backgroundColor: Colors.input,
    color: Colors.text,
    paddingHorizontal: 14,
    fontSize: 16,
    letterSpacing: 2,
  },
  securityActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
});
