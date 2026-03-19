import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
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
  Headphones,
  Heart,
  Lock,
  LogOut,
  MessageSquare,
  Newspaper,
  Palette,
  Pencil,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Avatar } from "../../components/Avatar";
import { GuidedTourTarget } from "../../components/GuidedTourTarget";
import { PersistentCachedImage } from "../../components/PersistentCachedImage";
import { TextInput } from "../../components/TextInput";
import { UserDisplayName } from "../../components/UserDisplayName";
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
import { setAppUnlockToken } from "../../lib/session";
import { useI18n } from "../../i18n";
import type {
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

type ProfileTab =
  | null
  | "groups"
  | "articles"
  | "courses"
  | "appearance"
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
  language: "profile-language-tab",
  premium: "profile-premium-tab",
  support: "profile-support-tab",
  favorites: "profile-favorites-tab",
};

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
          requireManualDownload
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
}: {
  visible: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: (nextUser: User) => Promise<void>;
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
    if (!visible) return;

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
  }, [user, visible]);

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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlayStrong} onPress={onClose}>
        <GuidedTourTarget targetKey="profile-edit-dialog">
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
        </GuidedTourTarget>
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
  routeParams?: { userId?: string | null; jammId?: string | number | null };
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
  const requestedProfileIdentifier = requestedJammId || requestedUserId;
  const isRequestedOwnProfile =
    !requestedProfileIdentifier ||
    requestedUserId === currentUserId ||
    requestedJammId === String(user?.jammId || "");
  const isViewingOwnProfile = Boolean(user) && isRequestedOwnProfile;
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securityModalMode, setSecurityModalMode] = useState<SecurityPinMode>("setup");
  const [utilitySelectionSheet, setUtilitySelectionSheet] =
    useState<UtilitySelectionSheet>(null);
  const [promoCode, setPromoCode] = useState("");
  const profileScrollY = useRef(new Animated.Value(0)).current;
  const activeTab = forcedTab ?? null;
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
    enabled: activeTab === "courses" || activeTab === null || activeTab === "learn",
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

  useEffect(() => {
    if (!guidedTourActive || !isViewingOwnProfile) {
      return;
    }

    setProfileEditOpen(guidedTourStepKey === "profile-edit-dialog");
  }, [guidedTourActive, guidedTourStepKey, isViewingOwnProfile]);

  useEffect(() => {
    if (!guidedTourActive && guidedTourStepKey === null) {
      setProfileEditOpen(false);
    }
  }, [guidedTourActive, guidedTourStepKey]);

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

  const renderOverview = () => (
    <Animated.ScrollView
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
                onPress={() => setProfileEditOpen(true)}
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

        <Animated.View
          style={[
            styles.statsCard,
            { transform: [{ translateY: statsTranslateY }] },
          ]}
        >
          {stats.map((item, index) => (
            <View
              key={item.label}
              style={[styles.statItem, index === stats.length - 1 && styles.statItemLast]}
            >
                <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </Animated.View>
        </Animated.View>
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
                    requireManualDownload
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
                  requireManualDownload
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
                onPress={() => void handleOpenSupportChat("premium")}
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
                            <Text style={styles.decorationEmoji}>{decoration.emoji}</Text>
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

     

      <ProfileEditModal
        visible={isViewingOwnProfile && profileEditOpen}
        user={user}
        onClose={() => setProfileEditOpen(false)}
        onSaved={handleProfileSaved}
      />

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
