import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  Calendar,
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
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { PersistentCachedImage } from "../../components/PersistentCachedImage";
import { TextInput } from "../../components/TextInput";
import { UserDisplayName } from "../../components/UserDisplayName";
import {
  articlesApi,
  coursesApi,
  postsApi,
  usersApi,
} from "../../lib/api";
import type { MainTabScreenProps } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { ProfileDecoration, User } from "../../types/entities";
import type { FeedImage, FeedPost } from "../../types/posts";
import { getEntityId } from "../../utils/chat";

type Props = MainTabScreenProps<"Profile">;

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

const PRIMARY_TABS: Array<{
  key: Exclude<ProfileTab, null>;
  label: string;
  icon: typeof MessageSquare;
  color: string;
}> = [
  { key: "groups", label: "Gurunglar", icon: MessageSquare, color: "#3ba55d" },
  { key: "articles", label: "Maqolalar", icon: Newspaper, color: "#2563eb" },
  { key: "courses", label: "Darslar", icon: GraduationCap, color: "#f59e0b" },
];

const UTILITY_TABS: Array<{
  key: Exclude<ProfileTab, null>;
  label: string;
  icon: typeof Palette;
  color: string;
}> = [
  { key: "appearance", label: "Ko'rinish", icon: Palette, color: "#5865f2" },
  { key: "language", label: "Til", icon: Globe, color: "#0ea5e9" },
  { key: "security", label: "Xavfsizlik", icon: Lock, color: "#ef4444" },
  { key: "premium", label: "Premium", icon: Shield, color: "#f59e0b" },
  { key: "support", label: "Yordam", icon: Headphones, color: "#16a34a" },
  { key: "favorites", label: "Sevimlilar", icon: Heart, color: "#ec4899" },
  { key: "learn", label: "O'rganish", icon: Sparkles, color: "#8b5cf6" },
];

const POST_WORD_LIMIT = 100;

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

function countWords(value = "") {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
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
    if (!text.trim() || saving || usedWords > POST_WORD_LIMIT) {
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
            maxLength={3000}
            autoFocus
          />

          <View style={styles.modalFooter}>
            <Text
              style={[
                styles.modalCounter,
                usedWords > POST_WORD_LIMIT && styles.modalCounterDanger,
              ]}
            >
              {usedWords}/{POST_WORD_LIMIT}
            </Text>
            <Pressable
              style={[
                styles.primaryButton,
                (!text.trim() || saving || usedWords > POST_WORD_LIMIT) &&
                  styles.primaryButtonDisabled,
              ]}
              disabled={!text.trim() || saving || usedWords > POST_WORD_LIMIT}
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

function SecurityPinModal({
  visible,
  enabled,
  loading,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  enabled: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!visible) {
      setPin("");
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.securityModal} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>
            {enabled ? "App lock PIN ni olib tashlash" : "App lock PIN o'rnatish"}
          </Text>
          <Text style={styles.securityHelp}>
            {enabled
              ? "Joriy PIN ni kiriting."
              : "Ilovaga kirishda ishlatiladigan PIN kiriting."}
          </Text>
          <TextInput
            value={pin}
            onChangeText={(value) => setPin(value.replace(/[^0-9]/g, ""))}
            placeholder="PIN"
            placeholderTextColor={Colors.subtleText}
            keyboardType="number-pad"
            secureTextEntry
            style={styles.securityInput}
            maxLength={8}
            autoFocus
          />
          <View style={styles.securityActions}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (!pin || loading) && styles.primaryButtonDisabled]}
              disabled={!pin || loading}
              onPress={() => void onSubmit(pin)}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {enabled ? "Olib tashlash" : "Saqlash"}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ProfileScreen({ navigation }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const currentUserId = getEntityId(user);
  const [activeTab, setActiveTab] = useState<ProfileTab>(null);
  const [paneVisible, setPaneVisible] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("uz");
  const paneTranslateX = useRef(new Animated.Value(screenWidth)).current;
  const paneStartXRef = useRef(screenWidth);
  const profileScrollY = useRef(new Animated.Value(0)).current;

  const postsQuery = useQuery({
    queryKey: ["profile-posts", currentUserId],
    queryFn: () => postsApi.fetchUserPosts(currentUserId),
    enabled: Boolean(currentUserId),
  });

  const articlesQuery = useQuery({
    queryKey: ["profile-articles", currentUserId],
    queryFn: () => articlesApi.fetchUserArticles(String(user?.jammId || currentUserId)),
    enabled: Boolean(currentUserId),
  });

  const coursesQuery = useQuery({
    queryKey: ["courses", "profile"],
    queryFn: () => coursesApi.fetchCourses(1, 40),
    enabled: activeTab === "courses" || activeTab === null || activeTab === "learn",
  });

  const decorationsQuery = useQuery({
    queryKey: ["profile-decorations"],
    queryFn: usersApi.getProfileDecorations,
    enabled: activeTab === "appearance" || activeTab === "premium",
  });

  const appLockQuery = useQuery({
    queryKey: ["app-lock"],
    queryFn: usersApi.getAppLockStatus,
    enabled: activeTab === "security",
  });

  const likedPostsQuery = useQuery({
    queryKey: ["liked-posts"],
    queryFn: postsApi.fetchLikedPosts,
    enabled: activeTab === "favorites",
  });

  const likedArticlesQuery = useQuery({
    queryKey: ["liked-articles"],
    queryFn: articlesApi.fetchLikedArticles,
    enabled: activeTab === "favorites",
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
    mutationFn: async (pin: string) => {
      if (appLockQuery.data?.enabled) {
        return usersApi.removeAppLockPin({ pin });
      }

      return usersApi.setAppLockPin({ pin });
    },
    onSuccess: async () => {
      setSecurityModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["app-lock"] });
    },
  });

  const ownedCourses = useMemo(() => {
    const allCourses = coursesQuery.data?.data || [];
    return allCourses.filter((course: CourseItem) => {
      const owner =
        typeof course.createdBy === "string"
          ? course.createdBy
          : getEntityId(course.createdBy as User | null);
      return owner === currentUserId;
    });
  }, [coursesQuery.data?.data, currentUserId]);

  const stats = useMemo(
    () => [
      { label: "Obunachilar", value: String(user?.followersCount || 0) },
      { label: "Gurunglar", value: String(postsQuery.data?.length || 0) },
      { label: "Maqolalar", value: String(articlesQuery.data?.length || 0) },
      { label: "Darslar", value: String(ownedCourses.length || 0) },
    ],
    [articlesQuery.data?.length, ownedCourses.length, postsQuery.data?.length, user?.followersCount],
  );
  const headerProgress = profileScrollY.interpolate({
    inputRange: [84, 170],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const headerBackdropOpacity = profileScrollY.interpolate({
    inputRange: [56, 148],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const headerContentTranslateY = profileScrollY.interpolate({
    inputRange: [84, 170],
    outputRange: [12, 0],
    extrapolate: "clamp",
  });
  const summaryOpacity = profileScrollY.interpolate({
    inputRange: [0, 112],
    outputRange: [1, 0.18],
    extrapolate: "clamp",
  });
  const summaryTranslateY = profileScrollY.interpolate({
    inputRange: [0, 160],
    outputRange: [0, -26],
    extrapolate: "clamp",
  });

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
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await logout();
  };

  const openPane = (tab: Exclude<ProfileTab, null>) => {
    setActiveTab(tab);
    setPaneVisible(true);
    paneTranslateX.stopAnimation();
    paneTranslateX.setValue(screenWidth);
    Animated.spring(paneTranslateX, {
      toValue: 0,
      damping: 24,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const closePane = () => {
    paneTranslateX.stopAnimation();
    Animated.timing(paneTranslateX, {
      toValue: screenWidth,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setPaneVisible(false);
      setActiveTab(null);
    });
  };

  useEffect(() => {
    if (!paneVisible) {
      paneTranslateX.setValue(screenWidth);
    }
  }, [paneTranslateX, paneVisible, screenWidth]);

  const panePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
          const { dx, dy, vx } = gestureState;
          return dx > 4 && (Math.abs(dx) > Math.abs(dy) * 0.72 || vx > 0.02);
        },
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          const { dx, dy, vx } = gestureState;
          return dx > 4 && (Math.abs(dx) > Math.abs(dy) * 0.72 || vx > 0.02);
        },
        onPanResponderGrant: () => {
          paneTranslateX.stopAnimation((value) => {
            paneStartXRef.current = value;
          });
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextValue = Math.max(
            0,
            Math.min(screenWidth, paneStartXRef.current + gestureState.dx),
          );
          paneTranslateX.setValue(nextValue);
        },
        onPanResponderRelease: (_event, gestureState) => {
          const shouldClose =
            gestureState.dx > screenWidth * 0.22 || gestureState.vx > 0.35;

          if (shouldClose) {
            closePane();
            return;
          }

          Animated.spring(paneTranslateX, {
            toValue: 0,
            damping: 24,
            stiffness: 220,
            mass: 0.9,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(paneTranslateX, {
            toValue: 0,
            damping: 24,
            stiffness: 220,
            mass: 0.9,
            useNativeDriver: true,
          }).start();
        },
      }),
    [paneTranslateX, screenWidth],
  );

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
      <Animated.View
        style={[
          styles.profileSummary,
          {
            opacity: summaryOpacity,
            transform: [{ translateY: summaryTranslateY }],
          },
        ]}
      >
        <View style={styles.cover}>
          <View style={styles.coverShade} />
          <Pressable
            style={styles.coverAction}
            onPress={() => openPane("appearance")}
          >
            <Pencil size={15} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.avatarWrap}>
          <Avatar
            label={user?.nickname || user?.username || "User"}
            uri={user?.avatar}
            size={76}
          />
        </View>

        <View style={styles.infoBlock}>
          <UserDisplayName
            user={user}
            fallback={user?.nickname || user?.username || "Foydalanuvchi"}
            size="lg"
            textStyle={styles.displayName}
            containerStyle={styles.displayNameWrap}
          />
          <Text style={styles.handle}>@{user?.username || "user"}</Text>
          <Text style={styles.bio}>
            {user?.bio || "Profilingizga qisqa ta'rif qo'shing."}
          </Text>
          <View style={styles.metaRow}>
            <Calendar size={13} color={Colors.mutedText} />
            <Text style={styles.metaText}>
              {formatJoinedDate(user?.createdAt) || "Jamm foydalanuvchisi"}
            </Text>
          </View>
        </View>

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
      </Animated.View>

      <View style={styles.tabRailContent}>
        <View style={styles.tabCard}>
          {PRIMARY_TABS.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                style={styles.tabRow}
                onPress={() => openPane(item.key)}
              >
                <View style={[styles.tabIcon, { backgroundColor: Colors.input }]}>
                  <Icon size={15} color={item.color} />
                </View>
                <Text style={styles.tabLabel}>{item.label}</Text>
                <ChevronRight size={16} color={Colors.subtleText} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tabCard}>
          {UTILITY_TABS.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                style={styles.tabRow}
                onPress={() => openPane(item.key)}
              >
                <View style={[styles.tabIcon, { backgroundColor: Colors.input }]}>
                  <Icon size={15} color={item.color} />
                </View>
                <Text style={styles.tabLabel}>{item.label}</Text>
                <ChevronRight size={16} color={Colors.subtleText} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footerCard}>
          <View style={styles.footerRow}>
            <View>
              <Text style={styles.footerTitle}>App version</Text>
              <Text style={styles.footerSubtitle}>Native mobile build</Text>
            </View>
            <Text style={styles.versionBadge}>Expo</Text>
          </View>

          <Pressable style={styles.footerRow} onPress={handleLogout}>
            <View>
              <Text style={styles.footerTitle}>Log out</Text>
              <Text style={styles.footerSubtitle}>Ushbu qurilmadan chiqish</Text>
            </View>
            <View style={styles.logoutBadge}>
              <LogOut size={14} color={Colors.danger} />
              <Text style={styles.logoutBadgeText}>Chiqish</Text>
            </View>
          </Pressable>
        </View>
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
            description="Birinchi gurungingizni shu yerdan yozishingiz mumkin."
            actionLabel="Yangi gurung"
            onAction={() => setComposerOpen(true)}
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
                    label={user?.nickname || user?.username || "User"}
                    uri={user?.avatar}
                    size={34}
                  />
                  <View style={styles.postMeta}>
                    <UserDisplayName
                      user={user}
                      fallback={user?.nickname || user?.username || "User"}
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
          description="Siz yaratgan kurslar shu yerda ko'rinadi."
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
    const decorations = decorationsQuery.data || [];
    const premiumActive = user?.premiumStatus === "active";

    return (
      <ScrollView
        style={styles.paneScroll}
        contentContainerStyle={styles.genericPaneContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.settingGroup}>
          <Text style={styles.settingGroupTitle}>Theme</Text>
          <Text style={styles.settingGroupText}>
            Mobile build hozircha frontend bilan mos ravishda dark theme’da ishlaydi.
          </Text>
          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>Dark</Text>
          </View>
        </View>

        <View style={styles.settingGroup}>
          <Text style={styles.settingGroupTitle}>Profile decoration</Text>
          <Text style={styles.settingGroupText}>
            Badge yoki dekoratsiyani shu yerdan almashtiring.
          </Text>

          <View style={styles.decorationGrid}>
            <Pressable
              style={[
                styles.decorationCard,
                !user?.selectedProfileDecorationId && styles.decorationCardActive,
              ]}
              onPress={() => updateDecorationMutation.mutate(null)}
            >
              <Text style={styles.decorationTitle}>Oddiy</Text>
              <Text style={styles.decorationMeta}>Dekoratsiyasiz ko'rinish</Text>
            </Pressable>

            {decorations.map((decoration: ProfileDecoration) => {
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
                  disabled={locked}
                  onPress={() => updateDecorationMutation.mutate(decoration.key)}
                >
                  <View style={styles.decorationPreview}>
                    <Text style={styles.decorationEmoji}>{decoration.emoji}</Text>
                    <Text style={styles.decorationTitle}>{decoration.label}</Text>
                  </View>
                  <Text style={styles.decorationMeta}>
                    {locked ? "Premium kerak" : decoration.animation}
                  </Text>
                </Pressable>
              );
            })}
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
      <View style={styles.settingGroup}>
        <Text style={styles.settingGroupTitle}>Ilova tili</Text>
        <Text style={styles.settingGroupText}>
          Mobile build uchun tezkor tanlov. Hozircha UI matnlari asosiy ravishda o'zbekcha.
        </Text>

        <View style={styles.languageRow}>
          {[
            { id: "uz", label: "O'zbek" },
            { id: "ru", label: "Русский" },
            { id: "en", label: "English" },
          ].map((option) => (
            <Pressable
              key={option.id}
              style={[
                styles.languageChip,
                selectedLanguage === option.id && styles.languageChipActive,
              ]}
              onPress={() => setSelectedLanguage(option.id)}
            >
              <Text
                style={[
                  styles.languageChipText,
                  selectedLanguage === option.id && styles.languageChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
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
      <View style={styles.settingGroup}>
        <Text style={styles.settingGroupTitle}>App lock</Text>
        <Text style={styles.settingGroupText}>
          Ilovani qayta ochganda PIN bilan himoyalash.
        </Text>
        {appLockQuery.isLoading ? (
          <ActivityIndicator color={Colors.primary} />
        ) : (
          <>
            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>Holat</Text>
                <Text style={styles.settingText}>
                  {appLockQuery.data?.enabled ? "Yoqilgan" : "O'chirilgan"}
                </Text>
              </View>
              <Pressable
                style={styles.primaryButton}
                onPress={() => setSecurityModalOpen(true)}
              >
                <Text style={styles.primaryButtonText}>
                  {appLockQuery.data?.enabled ? "PIN olib tashlash" : "PIN o'rnatish"}
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => appLockQuery.refetch()}
            >
              <Text style={styles.secondaryButtonText}>Holatni yangilash</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );

  const renderPremiumPane = () => (
    <ScrollView
      style={styles.paneScroll}
      contentContainerStyle={styles.genericPaneContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.settingGroup}>
        <Text style={styles.settingGroupTitle}>Premium holati</Text>
        <Text style={styles.settingGroupText}>
          Premium obuna dekoratsiyalar va media imkoniyatlarini ochadi.
        </Text>
        <View
          style={[
            styles.statusBadge,
            user?.premiumStatus === "active" && styles.statusBadgeActive,
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              user?.premiumStatus === "active" && styles.statusBadgeTextActive,
            ]}
          >
            {user?.premiumStatus === "active" ? "Premium active" : "Standard"}
          </Text>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.settingGroupTitle}>Dekoratsiyalar</Text>
        <Text style={styles.settingGroupText}>
          {decorationsQuery.data?.length || 0} ta dekoratsiya mavjud.
        </Text>
      </View>
    </ScrollView>
  );

  const renderSupportPane = () => (
    <ScrollView
      style={styles.paneScroll}
      contentContainerStyle={styles.genericPaneContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.settingGroup}>
        <Text style={styles.settingGroupTitle}>Yordam markazi</Text>
        <Text style={styles.settingGroupText}>
          Muammo bo'lsa support bilan ulanish va build holatini ko'rish uchun tezkor bloklar.
        </Text>
        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>API ulanishi</Text>
          <Text style={styles.supportText}>Server bilan sessiya faol.</Text>
        </View>
        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>Chatlar</Text>
          <Text style={styles.supportText}>
            {postsQuery.isError || articlesQuery.isError ? "Ba'zi so'rovlar xato qaytardi." : "Asosiy modul ishlayapti."}
          </Text>
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
      <View style={styles.settingGroup}>
        <Text style={styles.settingGroupTitle}>Yoqtirilgan gurunglar</Text>
        <Text style={styles.settingGroupText}>
          {likedPostsQuery.data?.length || 0} ta yoqtirilgan gurung.
        </Text>
        {(likedPostsQuery.data || []).slice(0, 4).map((post) => (
          <View key={post._id} style={styles.favoriteRow}>
            <Text style={styles.favoriteTitle} numberOfLines={1}>
              {post.content || "Rasmlar bilan gurung"}
            </Text>
            <Text style={styles.favoriteMeta}>{post.likes} like</Text>
          </View>
        ))}
      </View>

      <View style={styles.settingGroup}>
        <Text style={styles.settingGroupTitle}>Yoqtirilgan maqolalar</Text>
        <Text style={styles.settingGroupText}>
          {likedArticlesQuery.data?.length || 0} ta yoqtirilgan maqola.
        </Text>
        {(likedArticlesQuery.data || []).slice(0, 4).map((article: ProfileArticle) => (
          <View key={article._id} style={styles.favoriteRow}>
            <Text style={styles.favoriteTitle} numberOfLines={1}>
              {article.title}
            </Text>
            <Text style={styles.favoriteMeta}>{article.likes || 0} like</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderLearnPane = () => (
    <ScrollView
      style={styles.paneScroll}
      contentContainerStyle={styles.genericPaneContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.settingGroup}>
        <Text style={styles.settingGroupTitle}>Faollik xulosasi</Text>
        <Text style={styles.settingGroupText}>
          Profilingizdagi kontentlar va o'rganish ritmi bo'yicha tezkor ko'rinish.
        </Text>
        <View style={styles.learnGrid}>
          <View style={styles.learnCard}>
            <Text style={styles.learnValue}>{postsQuery.data?.length || 0}</Text>
            <Text style={styles.learnLabel}>Gurung</Text>
          </View>
          <View style={styles.learnCard}>
            <Text style={styles.learnValue}>{articlesQuery.data?.length || 0}</Text>
            <Text style={styles.learnLabel}>Maqola</Text>
          </View>
          <View style={styles.learnCard}>
            <Text style={styles.learnValue}>{ownedCourses.length || 0}</Text>
            <Text style={styles.learnLabel}>Kurs</Text>
          </View>
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
    PRIMARY_TABS.find((item) => item.key === activeTab)?.label ||
    UTILITY_TABS.find((item) => item.key === activeTab)?.label ||
    "Profile";

  if (!user) {
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
                transform: [{ translateY: headerContentTranslateY }],
              },
            ]}
          >
            <Avatar
              label={user?.nickname || user?.username || "User"}
              uri={user?.avatar}
              size={34}
              shape="circle"
            />
            <View style={styles.collapsedHeaderText}>
              <UserDisplayName
                user={user}
                fallback={user?.nickname || user?.username || "Foydalanuvchi"}
                size="sm"
                textStyle={styles.collapsedHeaderName}
              />
              <Text style={styles.collapsedHeaderHandle}>
                @{user?.username || "user"}
              </Text>
            </View>
          </Animated.View>
        </Animated.View>

        {renderOverview()}

        {paneVisible && activeTab ? (
          <Animated.View
            style={[
              styles.paneOverlay,
              {
                width: screenWidth,
                transform: [{ translateX: paneTranslateX }],
              },
            ]}
            {...panePanResponder.panHandlers}
          >
            <View style={styles.paneContainer}>
              <ProfilePaneHeader
                title={activeTitle}
                onBack={closePane}
                action={
                  activeTab === "groups" ? (
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
          </Animated.View>
        ) : null}

      </View>

      <ProfilePostComposerModal
        visible={composerOpen}
        initialContent={editingPost?.content || ""}
        onClose={() => {
          setComposerOpen(false);
          setEditingPost(null);
        }}
        onSubmit={handleCreateOrUpdatePost}
      />

      <SecurityPinModal
        visible={securityModalOpen}
        enabled={Boolean(appLockQuery.data?.enabled)}
        loading={appLockMutation.isPending}
        onClose={() => setSecurityModalOpen(false)}
        onSubmit={async (pin) => {
          try {
            await appLockMutation.mutateAsync(pin);
          } catch (error) {
            Alert.alert(
              "PIN saqlanmadi",
              error instanceof Error ? error.message : "Noma'lum xatolik",
            );
          }
        }}
      />
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
  collapsedHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
  },
  collapsedHeaderBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(16,18,24,0.94)",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  collapsedHeaderContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
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
  tabRailContent: {
    paddingBottom: 110,
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
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  footerCard: {
    marginHorizontal: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  footerRow: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  footerSubtitle: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 2,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(240,71,71,0.08)",
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
