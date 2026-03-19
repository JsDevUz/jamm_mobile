import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  ArrowLeft,
  AlertCircle,
  Brain,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Eye,
  FolderOpen,
  Globe2,
  Heart,
  Layers,
  LogIn,
  Lock,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Pause,
  Send,
  Shield,
  Swords,
  UserPlus,
  ListVideo,
  Trash2,
  Type as TypeIcon,
  Users,
  X,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { GuidedTourTarget } from "../../components/GuidedTourTarget";
import { PersistentCachedImage } from "../../components/PersistentCachedImage";
import { TextInput } from "../../components/TextInput";
import { API_BASE_URL, APP_BASE_URL } from "../../config/env";
import { APP_LIMITS } from "../../constants/appLimits";
import { useI18n } from "../../i18n";
import { arenaApi, coursesApi } from "../../lib/api";
import {
  getCourseDetailCache,
  loadCourseListCache,
  replaceCourseListCache,
  upsertCourseDetailCache,
} from "../../lib/course-cache";
import {
  downloadOfflineLessonPlayback,
  getOfflineLessonPlayback,
  removeOfflineLessonPlayback,
  type OfflineLessonPlayback,
} from "../../lib/secure-course-video-cache";
import { openJammAwareLink } from "../../navigation/internalLinks";
import type { MainTabScreenProps, RootStackParamList } from "../../navigation/types";
import { SearchHeaderBar } from "../../shared/ui/SearchHeaderBar";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import { LinkedTestModal } from "./modals/LinkedTestModal";
import { MaterialEditorModal } from "./modals/MaterialEditorModal";
import { HomeworkEditorModal } from "./modals/HomeworkEditorModal";
import { HomeworkSubmitModal } from "./modals/HomeworkSubmitModal";
import { InlineSentenceBuilderModal, type SentenceBuilderDeck } from "./modals/InlineSentenceBuilderModal";
import { InlineTestPlayerModal } from "./modals/InlineTestPlayerModal";
import { LessonEditorModal } from "./modals/LessonEditorModal";
import { EnrollmentSection } from "./sections/EnrollmentSection";
import { AdminAttendanceSection } from "./sections/AdminAttendanceSection";
import { AdminGradingSection } from "./sections/AdminGradingSection";
import { AdminHomeworkSection } from "./sections/AdminHomeworkSection";
import { AdminMaterialsSection } from "./sections/AdminMaterialsSection";
import { AdminMembersSection } from "./sections/AdminMembersSection";
import { AdminTestsSection } from "./sections/AdminTestsSection";
import { CourseAdminPane, type CourseAdminTab } from "./sections/CourseAdminPane";
import { LessonMaterialsSection } from "./sections/LessonMaterialsSection";
import { LessonInfoSection } from "./sections/LessonInfoSection";
import { StudentExtrasSection } from "./sections/StudentExtrasSection";
import type {
  Course,
  CourseComment,
  CourseHomeworkAssignment,
  CourseLinkedTest,
  CourseLessonAttendanceResponse,
  CourseLessonGradingResponse,
  CourseLessonGradingRow,
  CourseLessonMaterial,
  CourseLesson,
  CourseMember,
} from "../../types/courses";
import type { ArenaTestPayload } from "../../types/arena";
import { getEntityId } from "../../utils/chat";

type Props = MainTabScreenProps<"Courses">;
type CourseDetailProps = NativeStackScreenProps<RootStackParamList, "CourseDetail">;
type CourseViewMode = "courses" | "arena";

type ArenaItem = {
  key: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
};

const LOCALE_BY_LANGUAGE = {
  uz: "uz-UZ",
  en: "en-US",
  ru: "ru-RU",
} as const;

const COURSE_CATEGORIES = ["IT", "Design", "Language", "Business", "Science"];
const DEFAULT_COURSE_GRADIENT = ["#667eea", "#764ba2"] as const;
const VIDEO_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

function timeAgo(
  value: string | null | undefined,
  t: (key: string, replacements?: Record<string, string | number>) => string,
  language: keyof typeof LOCALE_BY_LANGUAGE,
) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("feed.timeAgo.now");
  if (mins < 60) return t("feed.timeAgo.minutesShort", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("feed.timeAgo.hoursShort", { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t("feed.timeAgo.daysShort", { count: days });
  return new Date(value).toLocaleDateString(LOCALE_BY_LANGUAGE[language], {
    day: "numeric",
    month: "short",
  });
}

async function pickMedia() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    allowsEditing: false,
    quality: 0.82,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return result.assets[0].uri;
}

async function pickDocument(type = "*/*") {
  const result = await DocumentPicker.getDocumentAsync({
    type,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  return result.assets[0];
}

function formatFileSize(bytes?: number | null) {
  const value = Number(bytes || 0);
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getCourseLessonCount(course?: Course | null) {
  return course?.lessonCount ?? course?.lessons?.length ?? 0;
}

function getCourseOwnerId(course?: Course | null) {
  if (!course?.createdBy) return "";
  if (typeof course.createdBy === "string") return course.createdBy;
  return getEntityId(course.createdBy);
}

function getCourseMemberUserId(member?: CourseMember | null) {
  if (!member?.userId) return "";
  if (typeof member.userId === "string") {
    return member.userId;
  }
  return getEntityId(member.userId);
}

function getCourseMemberStatus(course?: Course | null, currentUserId?: string | null) {
  const normalizedUserId = String(currentUserId || "");
  if (!course || !normalizedUserId) return null;
  if (getCourseOwnerId(course) === normalizedUserId) {
    return "admin";
  }

  return (
    course.members?.find(
      (member) => String(getCourseMemberUserId(member) || "") === normalizedUserId,
    )?.status || null
  );
}

function getCourseMemberName(member?: CourseMember | null) {
  if (!member) return "Talaba";
  if (member.name) return member.name;
  if (typeof member.userId === "object" && member.userId) {
    return member.userId.nickname || member.userId.username || "Talaba";
  }
  return "Talaba";
}

function getCourseMemberAvatar(member?: CourseMember | null) {
  if (!member) return "";
  if (member.avatar) return member.avatar;
  if (typeof member.userId === "object" && member.userId) {
    return member.userId.avatar || "";
  }
  return "";
}

function formatDurationCompact(seconds?: number | null) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins < 1) return `${secs}s`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatPlaybackClock(seconds?: number | null) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function resolveApiUrl(path?: string | null) {
  const value = String(path || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE_URL}${value.startsWith("/") ? value : `/${value}`}`;
}

function getOfflineLessonMediaKey(
  courseId?: string | null,
  lessonId?: string | null,
  mediaId?: string | null,
) {
  return `${String(courseId || "")}:${String(lessonId || "")}:${String(mediaId || "primary")}`;
}

function resolveJammWebCourseLessonUrl(course?: Course | null, lesson?: CourseLesson | null) {
  const courseSlug = course?.urlSlug || course?._id || course?.id;
  const lessonSlug = lesson?.urlSlug || lesson?._id || lesson?.id;
  if (!courseSlug || !lessonSlug) {
    return `${APP_BASE_URL}/courses`;
  }
  return `${APP_BASE_URL}/courses/${courseSlug}/${lessonSlug}`;
}

function getCourseMemberCount(course?: Course | null) {
  return (
    course?.membersCount ??
    course?.totalMembersCount ??
    course?.members?.filter((member) => member.status === "approved").length ??
    0
  );
}

function getCourseGradientColors(gradient?: string | null): readonly [string, string] {
  const matches = String(gradient || "").match(
    /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/g,
  );

  if (matches && matches.length >= 2) {
    return [matches[0], matches[1]] as const;
  }

  if (matches && matches.length === 1) {
    return [matches[0], matches[0]] as const;
  }

  return DEFAULT_COURSE_GRADIENT;
}

function CommentsModal({
  visible,
  course,
  lesson,
  onClose,
}: {
  visible: boolean;
  course: Course | null;
  lesson: CourseLesson | null;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const [comments, setComments] = useState<CourseComment[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !course?._id || !lesson?._id) return;

    const load = async () => {
      setLoading(true);
      try {
        const response = await coursesApi.getLessonComments(course._id || "", lesson._id || "", 1, 10);
        setComments(response.data || []);
        setPage(1);
        setHasMore(1 < (response.totalPages || 1));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [course?._id, lesson?._id, visible]);

  const handleLoadMore = async () => {
    if (!course?._id || !lesson?._id || !hasMore || loading) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const response = await coursesApi.getLessonComments(course._id, lesson._id || "", nextPage, 10);
      setComments((prev) => [...prev, ...(response.data || [])]);
      setPage(nextPage);
      setHasMore(nextPage < (response.totalPages || 1));
    } finally {
      setLoading(false);
    }
  };

  const reload = async () => {
    if (!course?._id || !lesson?._id) return;
    const response = await coursesApi.getLessonComments(course._id, lesson._id || "", 1, 10);
    setComments(response.data || []);
    setPage(1);
    setHasMore(1 < (response.totalPages || 1));
  };

  const handleSend = async () => {
    if (!course?._id || !lesson?._id || !text.trim() || sending) return;
    setSending(true);
    try {
      if (replyingTo) {
        await coursesApi.addLessonReply(course._id, lesson._id || "", replyingTo, text.trim());
      } else {
        await coursesApi.addLessonComment(course._id, lesson._id || "", text.trim());
      }
      setText("");
      setReplyingTo(null);
      await reload();
    } finally {
      setSending(false);
    }
  };

  return (
    <DraggableBottomSheet
      visible={visible}
      title={t("coursePlayer.comments.title")}
      onClose={onClose}
      minHeight={520}
      initialHeightRatio={0.8}
      footer={
        <View style={styles.commentComposerWrap}>
          {replyingTo ? (
            <View style={styles.replyingBar}>
              <Text style={styles.replyingText}>{t("coursePlayer.comments.replyMode")}</Text>
              <Pressable onPress={() => setReplyingTo(null)}>
                <X size={14} color={Colors.mutedText} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.commentComposerRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t("coursePlayer.comments.placeholder")}
              placeholderTextColor={Colors.subtleText}
              style={styles.commentInput}
            />
            <Pressable
              style={[styles.sendButton, (!text.trim() || sending) && styles.sendButtonDisabled]}
              disabled={!text.trim() || sending}
              onPress={() => void handleSend()}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={16} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      }
    >
      <ScrollView
        style={styles.commentsScroll}
        contentContainerStyle={styles.commentsContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
            {comments.length === 0 && !loading ? (
              <View style={styles.commentsEmpty}>
                <Text style={styles.emptyText}>{t("coursePlayer.comments.empty")}</Text>
              </View>
            ) : (
              comments.map((comment) => (
                <View key={comment._id} style={styles.commentBlock}>
                  <View style={styles.commentBubble}>
                    <View style={styles.commentHeader}>
                          <Text style={styles.commentAuthor}>{comment.userName || "User"}</Text>
                      <Text style={styles.commentTime}>{timeAgo(comment.createdAt, t, language)}</Text>
                    </View>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>
                  <Pressable
                    style={styles.replyAction}
                    onPress={() => setReplyingTo(comment._id || null)}
                  >
                    <Text style={styles.replyActionText}>{t("coursePlayer.comments.replyAction")}</Text>
                  </Pressable>

                  {comment.replies?.length ? (
                    <View style={styles.replyList}>
                      {comment.replies.map((reply) => (
                        <View key={reply._id} style={styles.replyBubble}>
                          <View style={styles.commentHeader}>
                            <Text style={styles.commentAuthor}>{reply.userName || "User"}</Text>
                            <Text style={styles.commentTime}>{timeAgo(reply.createdAt, t, language)}</Text>
                          </View>
                          <Text style={styles.commentText}>{reply.text}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            )}

            {hasMore ? (
              <Pressable style={styles.loadMoreButton} onPress={() => void handleLoadMore()}>
                <Text style={styles.loadMoreText}>
                  {loading ? t("common.loading") : t("coursePlayer.comments.loadMore")}
                </Text>
              </Pressable>
            ) : null}
      </ScrollView>
    </DraggableBottomSheet>
  );
}

function CreateCourseModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    description?: string;
    image?: string;
    category?: string;
    accessType?: "paid" | "free_request" | "free_open";
    price?: number;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("IT");
  const [price, setPrice] = useState("0");
  const [accessType, setAccessType] = useState<"paid" | "free_request" | "free_open">(
    "free_request",
  );
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setName("");
      setDescription("");
      setCategory("IT");
      setPrice("0");
      setAccessType("free_request");
      setImage("");
      setUploading(false);
      setSaving(false);
    }
  }, [visible]);

  const handlePickImage = async () => {
    const fileUri = await pickMedia();
    if (!fileUri) return;

    setUploading(true);
    try {
      const uploaded = await coursesApi.uploadMedia(fileUri);
      setImage(uploaded.url || uploaded.fileUrl || "");
    } catch (error) {
      Alert.alert(
        t("articles.imageUploadFailed"),
        error instanceof Error ? error.message : "Noma'lum xatolik",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        image: image.trim(),
        category: category.trim() || "IT",
        accessType,
        price: Number(price || 0),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.createModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.createHeader}>
            <Text style={styles.createTitle}>{t("createCourse.title")}</Text>
            <Pressable style={styles.iconCircle} onPress={onClose}>
              <X size={18} color={Colors.mutedText} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.createContent} showsVerticalScrollIndicator={false}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("createCourse.name")}
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t("createCourse.description")}
              placeholderTextColor={Colors.subtleText}
              style={[styles.fieldInput, styles.textArea]}
              multiline
            />
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder={t("createCourse.category")}
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder={t("createCourse.price")}
              placeholderTextColor={Colors.subtleText}
              keyboardType="number-pad"
              style={styles.fieldInput}
            />

            <View style={styles.accessRow}>
              {[
                { id: "free_request", label: t("createCourse.access.freeRequest") },
                { id: "free_open", label: t("createCourse.access.freeOpen") },
                { id: "paid", label: t("createCourse.access.paid") },
              ].map((option) => (
                <Pressable
                  key={option.id}
                  style={[
                    styles.accessChip,
                    accessType === option.id && styles.accessChipActive,
                  ]}
                  onPress={() =>
                    setAccessType(option.id as "paid" | "free_request" | "free_open")
                  }
                >
                  <Text
                    style={[
                      styles.accessChipText,
                      accessType === option.id && styles.accessChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.mediaPicker} onPress={() => void handlePickImage()}>
              <Text style={styles.mediaPickerText}>
                {uploading ? t("common.loading") : image ? t("articles.editor.coverReady") : t("createCourse.imageChange")}
              </Text>
            </Pressable>

            {image ? (
              <PersistentCachedImage
                remoteUri={image}
                style={styles.coverPreview}
                requireManualDownload
              />
            ) : null}
          </ScrollView>

          <View style={styles.createFooter}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (!name.trim() || saving) && styles.sendButtonDisabled]}
              disabled={!name.trim() || saving}
              onPress={() => void handleSubmit()}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{t("common.create")}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function CoursesScreen({ navigation, route }: Props) {
  return <CoursesScreenContent navigation={navigation} routeParams={route.params} />;
}

export function CourseDetailScreen({ navigation, route }: CourseDetailProps) {
  return (
    <CoursesScreenContent
      navigation={navigation as any}
      routeParams={route.params}
      detailOnly
    />
  );
}

type SharedCoursesProps = {
  navigation: Props["navigation"] | CourseDetailProps["navigation"];
  routeParams?: {
    courseId?: string | null;
    lessonId?: string | null;
    viewMode?: CourseViewMode | null;
  };
  detailOnly?: boolean;
};

function CoursesScreenContent({
  navigation,
  routeParams,
  detailOnly = false,
}: SharedCoursesProps) {
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const formatRelativeTime = useCallback(
    (value?: string | null) => timeAgo(value, t, language),
    [language, t],
  );
  const { width: screenWidth } = useWindowDimensions();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(user);
  const [viewMode, setViewMode] = useState<CourseViewMode>("courses");
  const pagerRef = useRef<ScrollView>(null);
  const pagerScrollX = useRef(new Animated.Value(0)).current;
  const courseDetailTranslateX = useRef(new Animated.Value(0)).current;
  const adminPaneTranslateX = useRef(new Animated.Value(screenWidth)).current;
  const currentIndexRef = useRef(0);
  const [tabsWidth, setTabsWidth] = useState(0);
  const [query, setQuery] = useState("");
  const [listRefreshing, setListRefreshing] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(() =>
    detailOnly ? String(routeParams?.courseId || "").trim() || null : null,
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(() =>
    detailOnly ? String(routeParams?.lessonId || "").trim() || null : null,
  );
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [lessonAdminPanelOpen, setLessonAdminPanelOpen] = useState(false);
  const [adminActiveTab, setAdminActiveTab] = useState<CourseAdminTab>("homework");
  const [createOpen, setCreateOpen] = useState(false);
  const [lessonEditorOpen, setLessonEditorOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<CourseLesson | null>(null);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [linkedTestModalOpen, setLinkedTestModalOpen] = useState(false);
  const [homeworkModalOpen, setHomeworkModalOpen] = useState(false);
  const [homeworkSubmitOpen, setHomeworkSubmitOpen] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<CourseHomeworkAssignment | null>(null);
  const [materialsExpanded, setMaterialsExpanded] = useState(true);
  const [testsExpanded, setTestsExpanded] = useState(true);
  const [homeworkExpanded, setHomeworkExpanded] = useState(true);
  const [gradingExpanded, setGradingExpanded] = useState(false);
  const [playlistCollapsed, setPlaylistCollapsed] = useState(false);
  const [lessonDescriptionSheetOpen, setLessonDescriptionSheetOpen] = useState(false);
  const [studentExtrasOpen, setStudentExtrasOpen] = useState(false);
  const [editingOralRows, setEditingOralRows] = useState<Record<string, boolean>>({});
  const [oralScoreDrafts, setOralScoreDrafts] = useState<Record<string, string>>({});
  const [oralNoteDrafts, setOralNoteDrafts] = useState<Record<string, string>>({});
  const [memberActionTargetId, setMemberActionTargetId] = useState<string | null>(null);
  const [attendanceActionTargetId, setAttendanceActionTargetId] = useState<string | null>(null);
  const [oralSavingUserId, setOralSavingUserId] = useState<string | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [activeLinkedTest, setActiveLinkedTest] = useState<CourseLinkedTest | null>(null);
  const [activeArenaTest, setActiveArenaTest] = useState<ArenaTestPayload | null>(null);
  const [activeSentenceDeck, setActiveSentenceDeck] = useState<SentenceBuilderDeck | null>(null);
  const [arenaLoading, setArenaLoading] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [playbackStreamUrl, setPlaybackStreamUrl] = useState("");
  const [playbackStreamType, setPlaybackStreamType] = useState<"direct" | "hls" | "">("");
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [playbackRetryNonce, setPlaybackRetryNonce] = useState(0);
  const [offlinePlaybackMap, setOfflinePlaybackMap] = useState<
    Record<string, OfflineLessonPlayback>
  >({});
  const [offlinePlaybackBypassKeys, setOfflinePlaybackBypassKeys] = useState<
    Record<string, true>
  >({});
  const [offlinePlaybackLoading, setOfflinePlaybackLoading] = useState(false);
  const [offlineLookupScopeKey, setOfflineLookupScopeKey] = useState("");
  const [offlineRefreshNonce, setOfflineRefreshNonce] = useState(0);
  const [offlineDownloading, setOfflineDownloading] = useState(false);
  const [offlineRemoving, setOfflineRemoving] = useState(false);
  const [offlineDownloadProgress, setOfflineDownloadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [mediaCurrentTime, setMediaCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [mediaBufferedPosition, setMediaBufferedPosition] = useState(0);
  const [isLessonVideoPlaying, setIsLessonVideoPlaying] = useState(false);
  const [isLessonVideoStarting, setIsLessonVideoStarting] = useState(false);
  const [isLessonVideoFullscreen, setIsLessonVideoFullscreen] = useState(false);
  const [offlineTooltipVisible, setOfflineTooltipVisible] = useState(false);
  const [videoProgressTrackWidth, setVideoProgressTrackWidth] = useState(0);
  const [videoChromeVisible, setVideoChromeVisible] = useState(true);
  const [videoScrubPercent, setVideoScrubPercent] = useState<number | null>(null);
  const [playerSettingsOpen, setPlayerSettingsOpen] = useState(false);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const offlineTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoChromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineTooltipSuppressPressRef = useRef(false);
  const videoViewRef = useRef<VideoView | null>(null);
  const adminPaneBackdropOpacity = useMemo(
    () =>
      adminPaneTranslateX.interpolate({
        inputRange: [0, Math.max(screenWidth, 1)],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
    [adminPaneTranslateX, screenWidth],
  );

  const clearOfflineTooltipTimer = useCallback(() => {
    if (offlineTooltipTimerRef.current) {
      clearTimeout(offlineTooltipTimerRef.current);
      offlineTooltipTimerRef.current = null;
    }
  }, []);

  const clearVideoChromeTimer = useCallback(() => {
    if (videoChromeTimerRef.current) {
      clearTimeout(videoChromeTimerRef.current);
      videoChromeTimerRef.current = null;
    }
  }, []);

  const clearVideoStartTimer = useCallback(() => {
    if (videoStartTimerRef.current) {
      clearTimeout(videoStartTimerRef.current);
      videoStartTimerRef.current = null;
    }
  }, []);

  const scheduleVideoChromeAutoHide = useCallback(() => {
    clearVideoChromeTimer();
    videoChromeTimerRef.current = setTimeout(() => {
      setVideoChromeVisible(false);
      videoChromeTimerRef.current = null;
    }, 3200);
  }, [clearVideoChromeTimer]);

  const showVideoChrome = useCallback(
    (withAutoHide = true) => {
      setVideoChromeVisible(true);
      if (withAutoHide) {
        scheduleVideoChromeAutoHide();
      } else {
        clearVideoChromeTimer();
      }
    },
    [clearVideoChromeTimer, scheduleVideoChromeAutoHide],
  );

  const hideVideoChrome = useCallback(() => {
    clearVideoChromeTimer();
    setVideoChromeVisible(false);
  }, [clearVideoChromeTimer]);

  const showOfflineTooltip = useCallback(() => {
    clearOfflineTooltipTimer();
    setOfflineTooltipVisible(true);
    offlineTooltipTimerRef.current = setTimeout(() => {
      setOfflineTooltipVisible(false);
      offlineTooltipSuppressPressRef.current = false;
      offlineTooltipTimerRef.current = null;
    }, 1800);
  }, [clearOfflineTooltipTimer]);

  useEffect(() => {
    return () => {
      clearOfflineTooltipTimer();
      clearVideoChromeTimer();
    };
  }, [clearOfflineTooltipTimer, clearVideoChromeTimer]);
  const isExpoWebPlaybackFallback = Platform.OS === "web";
  const canUseOfflineLessonCache = Platform.OS !== "web";

  const coursesQuery = useQuery({
    queryKey: ["courses"],
    queryFn: () => coursesApi.fetchCourses(1, 40),
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    let active = true;

    const hydrateCourseListCache = async () => {
      const cachedResponse = await loadCourseListCache();
      if (!active || !cachedResponse?.data?.length || queryClient.getQueryData(["courses"])) {
        return;
      }

      queryClient.setQueryData(["courses"], cachedResponse);
    };

    void hydrateCourseListCache();

    return () => {
      active = false;
    };
  }, [queryClient]);

  useEffect(() => {
    if (!coursesQuery.data?.data?.length) {
      return;
    }

    void replaceCourseListCache(coursesQuery.data).catch(() => undefined);
  }, [coursesQuery.data]);

  const handleRefreshCourses = useCallback(async () => {
    setListRefreshing(true);
    try {
      await coursesQuery.refetch();
    } finally {
      setListRefreshing(false);
    }
  }, [coursesQuery]);

  const selectedCourseQuery = useQuery({
    queryKey: ["course", selectedCourseId],
    queryFn: () => coursesApi.getCourse(selectedCourseId || ""),
    enabled: Boolean(selectedCourseId),
  });

  useEffect(() => {
    let active = true;

    const hydrateSelectedCourseCache = async () => {
      if (!selectedCourseId) {
        return;
      }

      const cachedCourse = await getCourseDetailCache(selectedCourseId);
      if (!active || !cachedCourse) {
        return;
      }

      queryClient.setQueryData(["course", selectedCourseId], (current: Course | undefined) =>
        current ? { ...cachedCourse, ...current } : cachedCourse,
      );
    };

    void hydrateSelectedCourseCache();

    return () => {
      active = false;
    };
  }, [queryClient, selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseQuery.data) {
      return;
    }

    void upsertCourseDetailCache(selectedCourseQuery.data).catch(() => undefined);
  }, [selectedCourseQuery.data]);

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string;
      image?: string;
      category?: string;
      accessType?: "paid" | "free_request" | "free_open";
      price?: number;
    }) => coursesApi.createCourse(payload),
    onSuccess: async (course) => {
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
      const courseId = course.urlSlug || course._id || null;
      const lessonId = course.lessons?.[0]?._id || null;
      if (detailOnly) {
        setSelectedCourseId(courseId);
        setSelectedLessonId(lessonId);
        return;
      }
      if (courseId) {
        (navigation as any).navigate("CourseDetail", {
          courseId,
          lessonId: lessonId || undefined,
        });
      }
    },
  });

  const enrollMutation = useMutation({
    mutationFn: (courseId: string) => coursesApi.enrollInCourse(courseId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
      if (selectedCourseId) {
        await queryClient.invalidateQueries({ queryKey: ["course", selectedCourseId] });
      }
    },
  });

  const approveCourseMemberMutation = useMutation({
    mutationFn: ({ courseId, userId }: { courseId: string; userId: string }) =>
      coursesApi.approveCourseMember(courseId, userId),
    onSuccess: async () => {
      await invalidateCourseDetail();
    },
  });

  const removeCourseMemberMutation = useMutation({
    mutationFn: ({ courseId, userId }: { courseId: string; userId: string }) =>
      coursesApi.removeCourseMember(courseId, userId),
    onSuccess: async () => {
      await invalidateCourseDetail();
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: (courseId: string) => coursesApi.deleteCourse(courseId),
    onSuccess: async (_data, courseId) => {
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
      if (selectedCourseId === courseId) {
        setSelectedCourseId(null);
      }
    },
  });

  const likeLessonMutation = useMutation({
    mutationFn: ({ courseId, lessonId }: { courseId: string; lessonId: string }) =>
      coursesApi.toggleLessonLike(courseId, lessonId),
    onSuccess: async () => {
      if (selectedCourseId) {
        await queryClient.invalidateQueries({ queryKey: ["course", selectedCourseId] });
      }
    },
  });

  const allCourses = coursesQuery.data?.data || [];
  const enrolledCourses = useMemo(
    () =>
      allCourses.filter(
        (course) => {
          const memberStatus = getCourseMemberStatus(course, currentUserId);
          return (
            memberStatus === "admin" ||
            memberStatus === "approved" ||
            memberStatus === "pending"
          );
        },
      ),
    [allCourses, currentUserId],
  );

  const filteredCourses = useMemo(() => {
    const source = query.trim() ? allCourses : enrolledCourses;
    const needle = query.trim().toLowerCase();
    if (!needle) return source;

    return source.filter((course) =>
      [course.name, course.description, course.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [allCourses, enrolledCourses, query]);

  const arenaItems = useMemo<ArenaItem[]>(
    () => [
      {
        key: "tests",
        title: t("courseSidebar.arena.testsTitle"),
        description: t("courseSidebar.arena.testsDescription"),
        icon: BookOpen,
      },
      {
        key: "flashcards",
        title: t("courseSidebar.arena.flashcardsTitle"),
        description: t("courseSidebar.arena.flashcardsDescription"),
        icon: Layers,
      },
      {
        key: "sentenceBuilders",
        title: t("courseSidebar.arena.sentencesTitle"),
        description: t("courseSidebar.arena.sentencesDescription"),
        icon: TypeIcon,
      },
      {
        key: "mnemonics",
        title: t("courseSidebar.arena.mnemonicsTitle"),
        description: t("courseSidebar.arena.mnemonicsDescription"),
        icon: Brain,
      },
      {
        key: "battles",
        title: t("courseSidebar.arena.battlesTitle"),
        description: t("courseSidebar.arena.battlesDescription"),
        icon: Swords,
      },
    ],
    [t],
  );

  const filteredArenaItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return arenaItems;

    return arenaItems.filter((item) =>
      `${item.title} ${item.description}`.toLowerCase().includes(needle),
    );
  }, [arenaItems, query]);

  const selectedCourseListEntry = useMemo(
    () =>
      allCourses.find(
        (course) =>
          String(course._id || "") === String(selectedCourseId || "") ||
          String(course.urlSlug || "") === String(selectedCourseId || "") ||
          String(course.id || "") === String(selectedCourseId || ""),
      ) || null,
    [allCourses, selectedCourseId],
  );

  const currentCourse = useMemo(() => {
    if (!selectedCourseQuery.data && !selectedCourseListEntry) {
      return null;
    }

    if (!selectedCourseQuery.data) {
      return selectedCourseListEntry;
    }

    if (!selectedCourseListEntry) {
      return selectedCourseQuery.data;
    }

    return {
      ...selectedCourseListEntry,
      ...selectedCourseQuery.data,
      members:
        selectedCourseQuery.data.members?.length
          ? selectedCourseQuery.data.members
          : selectedCourseListEntry.members,
      lessons:
        selectedCourseQuery.data.lessons?.length
          ? selectedCourseQuery.data.lessons
          : selectedCourseListEntry.lessons,
    };
  }, [selectedCourseListEntry, selectedCourseQuery.data]);
  const currentCourseLessons =
    (currentCourse?.lessons?.length ? currentCourse.lessons : selectedCourseListEntry?.lessons) ||
    [];
  const currentLesson =
    currentCourseLessons.find(
      (lesson) =>
        String(lesson._id || "") === String(selectedLessonId || "") ||
        String(lesson.urlSlug || "") === String(selectedLessonId || ""),
    ) ||
    currentCourseLessons[0] ||
    null;
  const currentLessonIndex = Math.max(
    0,
    currentCourseLessons.findIndex(
      (lesson) =>
        String(lesson._id || "") === String(currentLesson?._id || "") ||
        String(lesson.urlSlug || "") === String(currentLesson?.urlSlug || ""),
    ) ?? 0,
  );
  const currentLessonHeaderTitle = currentLesson
    ? `${currentLessonIndex + 1}-dars: ${currentLesson.title || currentCourse?.name || "Dars"}`
    : currentCourse?.name || "Dars";
  const lessonKey =
    currentCourse?._id && currentLesson?._id ? [currentCourse._id, currentLesson._id] : null;
  const isOwner = Boolean(currentCourse && getCourseOwnerId(currentCourse) === currentUserId);

  const materialsQuery = useQuery({
    queryKey: ["course-materials", ...(lessonKey || [])],
    queryFn: () => coursesApi.getLessonMaterials(currentCourse?._id || "", currentLesson?._id || ""),
    enabled: Boolean(currentCourse?._id && currentLesson?._id),
  });

  const testsQuery = useQuery({
    queryKey: ["course-tests", ...(lessonKey || [])],
    queryFn: () => coursesApi.getLessonLinkedTests(currentCourse?._id || "", currentLesson?._id || ""),
    enabled: Boolean(currentCourse?._id && currentLesson?._id),
  });

  const homeworkQuery = useQuery({
    queryKey: ["course-homework", ...(lessonKey || [])],
    queryFn: () => coursesApi.getLessonHomework(currentCourse?._id || "", currentLesson?._id || ""),
    enabled: Boolean(currentCourse?._id && currentLesson?._id),
  });

  const attendanceQuery = useQuery({
    queryKey: ["course-attendance", ...(lessonKey || [])],
    queryFn: () =>
      coursesApi.getLessonAttendance(currentCourse?._id || "", currentLesson?._id || ""),
    enabled: Boolean(
      currentCourse?._id &&
        currentLesson?._id &&
        lessonAdminPanelOpen &&
        adminActiveTab === "attendance",
    ),
  });

  const gradingQuery = useQuery({
    queryKey: ["course-grading", ...(lessonKey || [])],
    queryFn: () => coursesApi.getLessonGrading(currentCourse?._id || "", currentLesson?._id || ""),
    enabled: Boolean(
      currentCourse?._id &&
        currentLesson?._id &&
        (gradingExpanded || (lessonAdminPanelOpen && adminActiveTab === "grading")),
    ),
  });

  const attendanceStatusMutation = useMutation({
    mutationFn: ({
      courseId,
      lessonId,
      userId,
      status,
    }: {
      courseId: string;
      lessonId: string;
      userId: string;
      status: "present" | "late" | "absent";
    }) => coursesApi.setLessonAttendanceStatus(courseId, lessonId, userId, status),
    onSuccess: async (data) => {
      if (lessonKey) {
        queryClient.setQueryData(["course-attendance", ...lessonKey], data);
      }
      await queryClient.invalidateQueries({ queryKey: ["course-grading", ...(lessonKey || [])] });
    },
  });

  const oralAssessmentMutation = useMutation({
    mutationFn: ({
      courseId,
      lessonId,
      userId,
      score,
      note,
    }: {
      courseId: string;
      lessonId: string;
      userId: string;
      score?: number | null;
      note?: string;
    }) => coursesApi.setLessonOralAssessment(courseId, lessonId, userId, { score, note }),
    onSuccess: (data) => {
      if (lessonKey) {
        queryClient.setQueryData(["course-grading", ...lessonKey], data);
      }
    },
  });

  const invalidateCourseDetail = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["courses"] });
    if (selectedCourseId) {
      await queryClient.invalidateQueries({ queryKey: ["course", selectedCourseId] });
    }
    if (lessonKey) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["course-materials", ...lessonKey] }),
        queryClient.invalidateQueries({ queryKey: ["course-tests", ...lessonKey] }),
        queryClient.invalidateQueries({ queryKey: ["course-homework", ...lessonKey] }),
        queryClient.invalidateQueries({ queryKey: ["course-grading", ...lessonKey] }),
      ]);
    }
  }, [lessonKey, queryClient, selectedCourseId]);

  useEffect(() => {
    if (selectedCourseId && currentCourseLessons.length && !selectedLessonId) {
      setSelectedLessonId(
        currentCourseLessons[0]._id || currentCourseLessons[0].urlSlug || null,
      );
    }
  }, [currentCourseLessons, selectedCourseId, selectedLessonId]);

  useEffect(() => {
    setActiveMediaIndex(0);
    setLessonDescriptionSheetOpen(false);
    setStudentExtrasOpen(false);
    setPlayerSettingsOpen(false);
    setVideoChromeVisible(true);
    setEditingOralRows({});
    setOralScoreDrafts({});
    setOralNoteDrafts({});
    setMemberActionTargetId(null);
    setAttendanceActionTargetId(null);
    setOralSavingUserId(null);
    setMediaCurrentTime(0);
    setMediaDuration(0);
    setMediaBufferedPosition(0);
    setPlaybackRetryNonce(0);
    setVideoScrubPercent(null);
  }, [currentLesson?._id, currentLesson?.urlSlug]);

  useEffect(() => {
    const nextIndex = viewMode === "arena" ? 1 : 0;
    currentIndexRef.current = nextIndex;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: false,
      });
    });
  }, [screenWidth, viewMode]);

  useEffect(() => {
    if (!selectedCourseId) {
      setIsLessonVideoFullscreen(false);
      return undefined;
    }

    void preventScreenCaptureAsync("courses-player").catch(() => undefined);

    return () => {
      void allowScreenCaptureAsync("courses-player").catch(() => undefined);
    };
  }, [selectedCourseId]);

  useEffect(() => {
    if (detailOnly) {
      return;
    }

    (navigation as any).setOptions({
      tabBarStyle: undefined,
    });

    return () => {
      (navigation as any).setOptions({
        tabBarStyle: undefined,
      });
    };
  }, [detailOnly, navigation]);

  const myMemberStatus =
    getCourseMemberStatus(currentCourse, currentUserId) ||
    getCourseMemberStatus(selectedCourseListEntry, currentUserId);
  const isApprovedMember = myMemberStatus === "approved";
  const isPendingMember = myMemberStatus === "pending";
  const canOpenLesson = useCallback(
    (lesson?: CourseLesson | null) => {
      const hasExplicitTestLock =
        Array.isArray(lesson?.accessLockedByTests) && lesson.accessLockedByTests.length > 0;

      return Boolean(
        isOwner ||
          lesson?.isUnlocked ||
          (isApprovedMember && lesson?.status !== "draft" && !hasExplicitTestLock),
      );
    },
    [isApprovedMember, isOwner],
  );
  const canAccessCurrentLesson = canOpenLesson(currentLesson);
  const lessonMaterials = materialsQuery.data?.items || currentLesson?.materials || [];
  const linkedTests = testsQuery.data?.items || currentLesson?.linkedTests || [];
  const homeworkAssignments =
    homeworkQuery.data?.assignments || currentLesson?.homework?.assignments || [];
  const grading = gradingQuery.data as CourseLessonGradingResponse | undefined;
  const lessonMediaItems = useMemo(() => {
    if (Array.isArray(currentLesson?.mediaItems) && currentLesson.mediaItems.length) {
      return currentLesson.mediaItems;
    }

    if (currentLesson?.videoUrl || currentLesson?.fileUrl) {
      return [
        {
          mediaId: "primary",
          title: currentLesson.title,
          videoUrl: currentLesson.videoUrl,
          fileUrl: currentLesson.fileUrl,
          fileName: currentLesson.fileName,
          fileSize: currentLesson.fileSize,
          durationSeconds: currentLesson.durationSeconds,
          streamType: currentLesson.streamType,
          streamAssets: currentLesson.streamAssets,
          hlsKeyAsset: currentLesson.hlsKeyAsset,
        },
      ];
    }

    return [];
  }, [currentLesson]);
  const activeMediaItem = lessonMediaItems[activeMediaIndex] || lessonMediaItems[0] || null;
  const currentLessonHasMedia = Boolean(lessonMediaItems.length);
  const canAttemptProtectedPlayback = Boolean(
    currentLesson &&
      canAccessCurrentLesson &&
      (currentLessonHasMedia || isApprovedMember || isOwner),
  );
  const lessonMediaSignature = useMemo(
    () =>
      lessonMediaItems
        .map((item, index) => String(item.mediaId || item.fileUrl || item.videoUrl || index))
        .join("|"),
    [lessonMediaItems],
  );
  const offlineLessonScopeKey = useMemo(
    () =>
      `${String(currentCourse?._id || "")}:${String(currentLesson?._id || "")}:${lessonMediaSignature}:${offlineRefreshNonce}`,
    [currentCourse?._id, currentLesson?._id, lessonMediaSignature, offlineRefreshNonce],
  );
  const activeOfflineMediaKey = useMemo(
    () =>
      getOfflineLessonMediaKey(
        currentCourse?._id,
        currentLesson?._id,
        activeMediaItem?.mediaId || null,
      ),
    [activeMediaItem?.mediaId, currentCourse?._id, currentLesson?._id],
  );
  const activeOfflinePlaybackStored = offlinePlaybackMap[activeOfflineMediaKey] || null;
  const activeOfflinePlayback =
    offlinePlaybackBypassKeys[activeOfflineMediaKey] !== true
      ? activeOfflinePlaybackStored
      : null;
  const isCurrentMediaOffline = Boolean(activeOfflinePlaybackStored);
  const lessonOfflineMediaKeys = useMemo(
    () =>
      lessonMediaItems.map((item) =>
        getOfflineLessonMediaKey(
          currentCourse?._id,
          currentLesson?._id,
          item.mediaId || null,
        ),
      ),
    [currentCourse?._id, currentLesson?._id, lessonMediaItems],
  );
  const lessonOfflineItems = useMemo(
    () =>
      lessonOfflineMediaKeys
        .map((key) => offlinePlaybackMap[key])
        .filter(Boolean) as OfflineLessonPlayback[],
    [lessonOfflineMediaKeys, offlinePlaybackMap],
  );
  const isLessonFullyOffline = Boolean(
    lessonMediaItems.length > 0 && lessonOfflineItems.length === lessonMediaItems.length,
  );

  useEffect(() => {
    setOfflineTooltipVisible(false);
    offlineTooltipSuppressPressRef.current = false;
    clearOfflineTooltipTimer();
  }, [activeOfflineMediaKey, clearOfflineTooltipTimer, isLessonFullyOffline]);
  const isUsingOfflinePlayback = Boolean(
    activeOfflinePlayback?.localUrl &&
      playbackStreamUrl &&
      activeOfflinePlayback.localUrl === playbackStreamUrl,
  );
  const hasLessonMaterials = Boolean(lessonMaterials.length);
  const hasLessonTests = Boolean(linkedTests.length);
  const hasHomeworkBadge = Boolean(homeworkAssignments.length);
  const hasLessonExtras = Boolean(hasLessonTests || hasHomeworkBadge);
  const canRenderLessonPlayer = canAttemptProtectedPlayback;
  const playbackSourceLabel = isUsingOfflinePlayback
    ? "Offline"
    : playbackStreamType === "hls"
      ? "Adaptive"
      : "Direct";
  const segmentDurations = useMemo(
    () =>
      lessonMediaItems.map((item, index) => {
        const persistedDuration = Number(item.durationSeconds || 0);
        if (index === activeMediaIndex) {
          return Math.max(persistedDuration, Number(mediaDuration || 0), 1);
        }

        return persistedDuration > 0 ? persistedDuration : 1;
      }),
    [activeMediaIndex, lessonMediaItems, mediaDuration],
  );
  const totalLessonDuration = useMemo(
    () => segmentDurations.reduce((sum, value) => sum + Number(value || 0), 0),
    [segmentDurations],
  );
  const elapsedBeforeCurrentMedia = useMemo(
    () =>
      segmentDurations
        .slice(0, activeMediaIndex)
        .reduce((sum, value) => sum + Number(value || 0), 0),
    [activeMediaIndex, segmentDurations],
  );
  const overallCurrentTime = elapsedBeforeCurrentMedia + mediaCurrentTime;
  const remainingPlaybackTime = Math.max(0, totalLessonDuration - overallCurrentTime);
  const overallProgressPercent = totalLessonDuration
    ? Math.max(0, Math.min(100, (overallCurrentTime / totalLessonDuration) * 100))
    : 0;
  const displayedProgressPercent =
    videoScrubPercent !== null ? videoScrubPercent : overallProgressPercent;
  const bufferedProgressPercent = totalLessonDuration
    ? Math.max(
        overallProgressPercent,
        Math.min(
          100,
          ((elapsedBeforeCurrentMedia + Math.max(mediaBufferedPosition, mediaCurrentTime)) /
            totalLessonDuration) *
            100,
        ),
      )
    : 0;
  const segmentBoundaries = useMemo(() => {
    if (!segmentDurations.length || !totalLessonDuration) return [];

    let accumulated = 0;
    return segmentDurations.slice(0, -1).map((value) => {
      accumulated += Number(value || 0);
      return (accumulated / totalLessonDuration) * 100;
    });
  }, [segmentDurations, totalLessonDuration]);
  const courseOwnerName = (() => {
    if (typeof currentCourse?.createdBy === "object" && currentCourse?.createdBy) {
      return (
        currentCourse.createdBy.nickname ||
        currentCourse.createdBy.name ||
        currentCourse.createdBy.username ||
        "Muallif"
      );
    }

    if (isOwner) {
      return user?.nickname || user?.username || "Siz";
    }

    return "Muallif";
  })();
  const courseOwnerAvatar =
    typeof currentCourse?.createdBy === "object" ? currentCourse?.createdBy?.avatar || "" : "";
  const approvedMembers = useMemo(
    () => (currentCourse?.members || []).filter((member) => member.status === "approved"),
    [currentCourse?.members],
  );
  const pendingMembers = useMemo(
    () => (currentCourse?.members || []).filter((member) => member.status === "pending"),
    [currentCourse?.members],
  );
  const selectedHasMedia = Boolean(
    (Array.isArray(currentLesson?.mediaItems) && currentLesson.mediaItems.length) ||
      currentLesson?.videoUrl ||
      currentLesson?.fileUrl,
  );
  const draftLessonsCount = useMemo(
    () =>
      currentCourseLessons.filter((lesson) => (lesson.status || "published") === "draft")
        .length,
    [currentCourseLessons],
  );
  const publishedLessonsCount = Math.max(0, currentCourseLessons.length - draftLessonsCount);
  const attendanceData = attendanceQuery.data as CourseLessonAttendanceResponse | undefined;

  useEffect(() => {
    if (
      !canUseOfflineLessonCache ||
      !currentCourse?._id ||
      !currentLesson?._id ||
      !lessonMediaItems.length
    ) {
      setOfflinePlaybackMap({});
      setOfflinePlaybackLoading(false);
      setOfflineLookupScopeKey("");
      return;
    }

    const courseId = currentCourse._id;
    const lessonId = currentLesson._id;
    let cancelled = false;
    setOfflinePlaybackLoading(true);
    setOfflineLookupScopeKey("");

    void Promise.all(
      lessonMediaItems.map(async (item) => {
        const cacheKey = getOfflineLessonMediaKey(
          courseId,
          lessonId,
          item.mediaId || null,
        );
        const playback = await getOfflineLessonPlayback({
          courseId,
          lessonId,
          mediaId: item.mediaId || undefined,
        });
        return [cacheKey, playback] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const nextMap: Record<string, OfflineLessonPlayback> = {};
        entries.forEach(([cacheKey, playback]) => {
          if (playback) {
            nextMap[cacheKey] = playback;
          }
        });
        setOfflinePlaybackMap(nextMap);
      })
      .catch(() => {
        if (!cancelled) {
          setOfflinePlaybackMap({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOfflinePlaybackLoading(false);
          setOfflineLookupScopeKey(offlineLessonScopeKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    canUseOfflineLessonCache,
    currentCourse?._id,
    currentLesson?._id,
    lessonMediaItems,
    lessonMediaSignature,
    offlineLessonScopeKey,
    offlineRefreshNonce,
  ]);

  useEffect(() => {
    setOfflinePlaybackBypassKeys({});
  }, [currentCourse?._id, currentLesson?._id, offlineRefreshNonce]);

  const securePlaybackSource = useMemo(
    () =>
      playbackStreamUrl
        ? {
            uri: playbackStreamUrl,
            contentType: playbackStreamType === "hls" ? ("hls" as const) : ("auto" as const),
          }
        : null,
    [playbackStreamType, playbackStreamUrl],
  );

  useEffect(() => {
    if (!currentCourse?._id || !currentLesson?._id || !canAttemptProtectedPlayback) {
      setPlaybackStreamUrl("");
      setPlaybackStreamType("");
      setPlaybackLoading(false);
      setPlaybackError("");
      setMediaCurrentTime(0);
      setMediaDuration(0);
      setMediaBufferedPosition(0);
      setIsLessonVideoStarting(false);
      return;
    }

    if (
      canUseOfflineLessonCache &&
      lessonMediaItems.length &&
      offlineLookupScopeKey !== offlineLessonScopeKey
    ) {
      setPlaybackLoading(true);
      setPlaybackError("");
      return;
    }

    if (canUseOfflineLessonCache && offlinePlaybackLoading) {
      setPlaybackLoading(true);
      setPlaybackError("");
      return;
    }

    if (canUseOfflineLessonCache && activeOfflinePlayback?.localUrl) {
      setPlaybackStreamType(activeOfflinePlayback.streamType);
      setPlaybackStreamUrl(activeOfflinePlayback.localUrl);
      setPlaybackLoading(false);
      setPlaybackError("");
      setMediaCurrentTime(0);
      setMediaDuration(0);
      setMediaBufferedPosition(0);
      return;
    }

    if (isExpoWebPlaybackFallback) {
      setPlaybackStreamUrl("");
      setPlaybackStreamType("");
      setPlaybackLoading(false);
      setPlaybackError("Protected video Expo web'da qo'llanmaydi. Uni Jamm web yoki native appda oching.");
      setMediaCurrentTime(0);
      setMediaDuration(0);
      setMediaBufferedPosition(0);
      setIsLessonVideoStarting(false);
      return;
    }

    let cancelled = false;
    setPlaybackLoading(true);
    setPlaybackError("");
    setMediaCurrentTime(0);
    setMediaDuration(0);
    setMediaBufferedPosition(0);

    void coursesApi
      .getLessonPlaybackToken(
        currentCourse._id,
        currentLesson._id,
        activeMediaItem?.mediaId || undefined,
      )
      .then((payload) => {
        if (cancelled) return;
        setPlaybackStreamType(payload.streamType === "hls" ? "hls" : "direct");
        setPlaybackStreamUrl(resolveApiUrl(payload.streamUrl));
      })
      .catch((error) => {
        if (cancelled) return;
        setPlaybackStreamUrl("");
        setPlaybackStreamType("");
        setPlaybackError(
          error instanceof Error
            ? error.message
            : "Protected video streamni ochib bo'lmadi.",
        );
        setIsLessonVideoStarting(false);
      })
      .finally(() => {
        if (!cancelled) {
          setPlaybackLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeMediaItem?.mediaId,
    activeOfflinePlayback,
    canAttemptProtectedPlayback,
    canUseOfflineLessonCache,
    currentCourse?._id,
    currentLesson?._id,
    isExpoWebPlaybackFallback,
    lessonMediaItems.length,
    offlineLessonScopeKey,
    offlineLookupScopeKey,
    offlinePlaybackLoading,
    playbackRetryNonce,
  ]);

  const lessonVideoPlayer = useVideoPlayer(securePlaybackSource, (player) => {
    player.loop = false;
    player.timeUpdateEventInterval = 0.25;
    player.keepScreenOnWhilePlaying = true;
  });

  useEffect(() => {
    lessonVideoPlayer.playbackRate = videoPlaybackRate;
  }, [lessonVideoPlayer, videoPlaybackRate]);

  useEffect(() => {
    setIsLessonVideoPlaying(lessonVideoPlayer.playing);

    const playingSubscription = lessonVideoPlayer.addListener("playingChange", (payload) => {
      setIsLessonVideoPlaying(payload.isPlaying);
      if (payload.isPlaying) {
        clearVideoStartTimer();
        setIsLessonVideoStarting(false);
      }
    });

    return () => {
      playingSubscription.remove();
    };
  }, [clearVideoStartTimer, lessonVideoPlayer]);

  useEffect(() => {
    if (!playbackStreamUrl || isLessonVideoFullscreen || playerSettingsOpen) {
      showVideoChrome(false);
      return;
    }

    if (isLessonVideoPlaying) {
      scheduleVideoChromeAutoHide();
      return;
    }

    showVideoChrome(false);
  }, [
    isLessonVideoFullscreen,
    isLessonVideoPlaying,
    playbackStreamUrl,
    playerSettingsOpen,
    scheduleVideoChromeAutoHide,
    showVideoChrome,
  ]);

  useEffect(() => {
    const timeSubscription = lessonVideoPlayer.addListener("timeUpdate", (payload) => {
      setMediaCurrentTime(payload.currentTime || 0);
      setMediaBufferedPosition(payload.bufferedPosition || 0);
    });
    const sourceLoadSubscription = lessonVideoPlayer.addListener("sourceLoad", (payload) => {
      setMediaDuration(payload.duration || 0);
      setMediaCurrentTime(0);
      setMediaBufferedPosition(0);
      if (pendingSeekTimeRef.current !== null) {
        lessonVideoPlayer.currentTime = pendingSeekTimeRef.current;
        pendingSeekTimeRef.current = null;
      }
    });
    const playToEndSubscription = lessonVideoPlayer.addListener("playToEnd", () => {
      if (activeMediaIndex < lessonMediaItems.length - 1) {
        setActiveMediaIndex((value) => value + 1);
        return;
      }

      const nextLesson = currentCourseLessons[currentLessonIndex + 1];
      if (nextLesson && canOpenLesson(nextLesson)) {
        setSelectedLessonId(nextLesson._id || nextLesson.urlSlug || null);
      }
    });
    const statusSubscription = lessonVideoPlayer.addListener("statusChange", (payload) => {
      if (payload.status === "error") {
        clearVideoStartTimer();
        setIsLessonVideoStarting(false);
      }
      if (payload.status !== "error") {
        return;
      }

      if (isUsingOfflinePlayback && activeOfflineMediaKey) {
        setOfflinePlaybackBypassKeys((current) => {
          if (current[activeOfflineMediaKey]) {
            return current;
          }

          return {
            ...current,
            [activeOfflineMediaKey]: true,
          };
        });
        setPlaybackStreamUrl("");
        setPlaybackStreamType("");
        setPlaybackLoading(true);
        setPlaybackError("");
        return;
      }

      setPlaybackError(payload.error?.message || "Lesson videoni ochib bo'lmadi.");
      setPlaybackLoading(false);
    });

    return () => {
      timeSubscription.remove();
      sourceLoadSubscription.remove();
      playToEndSubscription.remove();
      statusSubscription.remove();
    };
  }, [
    activeOfflineMediaKey,
    activeMediaIndex,
    canOpenLesson,
    clearVideoStartTimer,
    currentCourseLessons,
    currentLessonIndex,
    isUsingOfflinePlayback,
    lessonMediaItems.length,
    lessonVideoPlayer,
  ]);

  const handleToggleVideoPlayback = useCallback(() => {
    showVideoChrome();
    if (lessonVideoPlayer.playing) {
      clearVideoStartTimer();
      setIsLessonVideoStarting(false);
      lessonVideoPlayer.pause();
      return;
    }

    setIsLessonVideoStarting(true);
    clearVideoStartTimer();
    videoStartTimerRef.current = setTimeout(() => {
      setIsLessonVideoStarting(false);
      videoStartTimerRef.current = null;
    }, 10000);
    lessonVideoPlayer.play();
  }, [clearVideoStartTimer, lessonVideoPlayer, showVideoChrome]);

  const handleVideoSurfacePress = useCallback(() => {
    if (videoChromeVisible) {
      hideVideoChrome();
      return;
    }

    showVideoChrome();
  }, [hideVideoChrome, showVideoChrome, videoChromeVisible]);

  const handleEnterVideoFullscreen = useCallback(() => {
    showVideoChrome(false);
    if (isLessonVideoFullscreen) {
      void videoViewRef.current?.exitFullscreen();
      return;
    }

    void videoViewRef.current?.enterFullscreen();
  }, [isLessonVideoFullscreen, showVideoChrome]);

  const handleDownloadLessonOffline = useCallback(async () => {
    if (
      !canUseOfflineLessonCache ||
      !currentCourse?._id ||
      !currentLesson?._id ||
      !lessonMediaItems.length
    ) {
      return;
    }

    setOfflineDownloading(true);
    setOfflineDownloadProgress({
      current: 0,
      total: lessonMediaItems.length,
    });

    try {
      for (let index = 0; index < lessonMediaItems.length; index += 1) {
        const item = lessonMediaItems[index];
        setOfflineDownloadProgress({
          current: index + 1,
          total: lessonMediaItems.length,
        });

        const payload = await coursesApi.getLessonPlaybackToken(
          currentCourse._id,
          currentLesson._id,
          item.mediaId || undefined,
        );
        const streamUrl = resolveApiUrl(payload.streamUrl);

        if (!streamUrl) {
          throw new Error("Lesson videoni yuklab olish uchun stream topilmadi.");
        }

        await downloadOfflineLessonPlayback({
          courseId: currentCourse._id,
          lessonId: currentLesson._id,
          mediaId: item.mediaId || undefined,
          streamType: payload.streamType === "hls" ? "hls" : "direct",
          streamUrl,
        });
      }

      setOfflinePlaybackBypassKeys({});
      setOfflineRefreshNonce((value) => value + 1);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
      Alert.alert(
        "Offline saqlanmadi",
        error instanceof Error
          ? error.message
          : "Lesson videoni offline yuklab bo'lmadi.",
      );
    } finally {
      setOfflineDownloading(false);
      setOfflineDownloadProgress({ current: 0, total: 0 });
    }
  }, [
    canUseOfflineLessonCache,
    currentCourse?._id,
    currentLesson?._id,
    lessonMediaItems,
  ]);

  const handleRemoveLessonOffline = useCallback(async () => {
    if (!currentCourse?._id || !currentLesson?._id || !lessonMediaItems.length) {
      return;
    }

    setOfflineRemoving(true);

    try {
      for (const item of lessonMediaItems) {
        await removeOfflineLessonPlayback({
          courseId: currentCourse._id,
          lessonId: currentLesson._id,
          mediaId: item.mediaId || undefined,
        });
      }

      setOfflinePlaybackBypassKeys({});
      setOfflineRefreshNonce((value) => value + 1);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
      Alert.alert(
        "Offline nusxa o'chmadi",
        error instanceof Error
          ? error.message
          : "Saqlangan lesson videoni o'chirib bo'lmadi.",
      );
    } finally {
      setOfflineRemoving(false);
    }
  }, [currentCourse?._id, currentLesson?._id, lessonMediaItems]);

  const handleToggleLessonOffline = useCallback(() => {
    if (offlineDownloading || offlineRemoving) {
      return;
    }

    if (isLessonFullyOffline) {
      Alert.alert(
        "Offline saqlangan lesson",
        "Bu lesson ichidagi barcha section videolari private storage'dan o'chirilsinmi? O'chirilgandan keyin qayta internet kerak bo'ladi.",
        [
          {
            text: "Bekor qilish",
            style: "cancel",
          },
          {
            text: "O'chirish",
            style: "destructive",
            onPress: () => {
              void handleRemoveLessonOffline();
            },
          },
        ],
      );
      return;
    }

    void handleDownloadLessonOffline();
  }, [
    handleDownloadLessonOffline,
    handleRemoveLessonOffline,
    isLessonFullyOffline,
    offlineDownloading,
    offlineRemoving,
  ]);

  const handleSeekLessonProgress = useCallback(
    (ratio: number) => {
      if (!segmentDurations.length || !totalLessonDuration) {
        return;
      }

      const normalizedRatio = Math.max(0, Math.min(1, ratio));
      const targetTime = normalizedRatio * totalLessonDuration;

      let accumulated = 0;
      let targetSegmentIndex = 0;
      let targetSegmentTime = 0;

      for (let index = 0; index < segmentDurations.length; index += 1) {
        const segmentDuration = Math.max(1, Number(segmentDurations[index] || 0));
        const segmentEnd = accumulated + segmentDuration;

        if (targetTime <= segmentEnd || index === segmentDurations.length - 1) {
          targetSegmentIndex = index;
          targetSegmentTime = Math.max(0, targetTime - accumulated);
          break;
        }

        accumulated = segmentEnd;
      }

      if (targetSegmentIndex !== activeMediaIndex) {
        pendingSeekTimeRef.current = targetSegmentTime;
        setActiveMediaIndex(targetSegmentIndex);
        return;
      }

      lessonVideoPlayer.currentTime = targetSegmentTime;
    },
    [activeMediaIndex, lessonVideoPlayer, segmentDurations, totalLessonDuration],
  );

  const updateVideoScrubPreview = useCallback(
    (locationX: number) => {
      if (!videoProgressTrackWidth) {
        return 0;
      }

      const nextRatio = Math.max(0, Math.min(1, locationX / videoProgressTrackWidth));
      setVideoScrubPercent(nextRatio * 100);
      return nextRatio;
    },
    [videoProgressTrackWidth],
  );

  const finishVideoScrub = useCallback(
    (locationX: number) => {
      const nextRatio = updateVideoScrubPreview(locationX);
      setVideoScrubPercent(null);
      handleSeekLessonProgress(nextRatio);
    },
    [handleSeekLessonProgress, updateVideoScrubPreview],
  );

  const handleSeekRelative = useCallback(
    (deltaSeconds: number) => {
      if (!totalLessonDuration) {
        return;
      }

      const targetTime = Math.max(0, Math.min(totalLessonDuration, overallCurrentTime + deltaSeconds));
      handleSeekLessonProgress(targetTime / totalLessonDuration);
      showVideoChrome();
    },
    [handleSeekLessonProgress, overallCurrentTime, showVideoChrome, totalLessonDuration],
  );

  const handleSelectPlaybackRate = useCallback(
    (rate: number) => {
      setVideoPlaybackRate(rate);
      showVideoChrome();
      setPlayerSettingsOpen(false);
    },
    [showVideoChrome],
  );

  const handleSelectMediaItem = useCallback(
    (index: number) => {
      if (index === activeMediaIndex) {
        setPlayerSettingsOpen(false);
        return;
      }

      setActiveMediaIndex(index);
      setPlayerSettingsOpen(false);
      showVideoChrome();
    },
    [activeMediaIndex, showVideoChrome],
  );

  const handleOpenCourse = async (course: Course) => {
    await Haptics.selectionAsync();
    const identifier = course.urlSlug || course._id || null;
    const lessonId = course.lessons?.[0]?._id || course.lessons?.[0]?.urlSlug || null;
    if (detailOnly) {
      setSelectedCourseId(identifier);
      setSelectedLessonId(lessonId);
      setPlaylistCollapsed(false);
      return;
    }
    if (identifier) {
      (navigation as any).navigate("CourseDetail", {
        courseId: identifier,
        lessonId: lessonId || undefined,
      });
    }
  };

  const handleCloseCourseDetail = useCallback(() => {
    clearVideoStartTimer();
    setIsLessonVideoStarting(false);
    setIsLessonVideoFullscreen(false);
    setPlaylistCollapsed(false);
    setCommentsOpen(false);
    setLessonAdminPanelOpen(false);
    setAdminActiveTab("homework");
    setLessonEditorOpen(false);
    setEditingLesson(null);
    setMaterialModalOpen(false);
    setLinkedTestModalOpen(false);
    setHomeworkModalOpen(false);
    setHomeworkSubmitOpen(false);
    setSelectedHomework(null);
    setActiveLinkedTest(null);
    setActiveArenaTest(null);
    setActiveSentenceDeck(null);
    if (detailOnly) {
      (navigation as any).goBack();
      return;
    }
    setSelectedCourseId(null);
    setSelectedLessonId(null);
  }, [clearVideoStartTimer, detailOnly, navigation]);

  useEffect(() => {
    if (!selectedCourseId) {
      courseDetailTranslateX.setValue(0);
    }
  }, [courseDetailTranslateX, selectedCourseId]);

  useEffect(() => {
    if (!lessonAdminPanelOpen) {
      adminPaneTranslateX.stopAnimation();
      adminPaneTranslateX.setValue(screenWidth);
      return;
    }

    if (Platform.OS === "web") {
      adminPaneTranslateX.stopAnimation();
      adminPaneTranslateX.setValue(0);
      return;
    }

    adminPaneTranslateX.stopAnimation();
    adminPaneTranslateX.setValue(screenWidth);
    Animated.timing(adminPaneTranslateX, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [adminPaneTranslateX, lessonAdminPanelOpen, screenWidth]);

  const animateCourseDetailBack = useCallback(() => {
    Animated.spring(courseDetailTranslateX, {
      toValue: 0,
      damping: 22,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [courseDetailTranslateX]);

  const handleCourseSwipeGesture = useCallback(
    (event: { nativeEvent: { translationX: number } }) => {
      courseDetailTranslateX.setValue(Math.max(0, event.nativeEvent.translationX));
    },
    [courseDetailTranslateX],
  );

  const handleCourseSwipeBack = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, oldState, translationX, velocityX } = event.nativeEvent;

      if (state === State.BEGAN) {
        courseDetailTranslateX.stopAnimation();
        return;
      }

      if (isLessonVideoFullscreen) {
        return;
      }

      if (oldState !== State.ACTIVE) {
        if (state === State.CANCELLED || state === State.FAILED) {
          animateCourseDetailBack();
        }
        return;
      }

      const shouldClose = translationX > screenWidth * 0.22 || velocityX > 700;
      if (!shouldClose) {
        animateCourseDetailBack();
        return;
      }

      void Haptics.selectionAsync().catch(() => undefined);
      Animated.timing(courseDetailTranslateX, {
        toValue: screenWidth,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          handleCloseCourseDetail();
        }
      });
    },
    [
      animateCourseDetailBack,
      courseDetailTranslateX,
      handleCloseCourseDetail,
      isLessonVideoFullscreen,
      screenWidth,
    ],
  );

  const handleCloseLessonAdminPanel = useCallback(
    (onClosed?: () => void) => {
      if (!lessonAdminPanelOpen) {
        onClosed?.();
        return;
      }

      adminPaneTranslateX.stopAnimation();

      if (Platform.OS === "web") {
        setLessonAdminPanelOpen(false);
        adminPaneTranslateX.setValue(screenWidth);
        onClosed?.();
        return;
      }

      Animated.timing(adminPaneTranslateX, {
        toValue: screenWidth,
        duration: 190,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }
        setLessonAdminPanelOpen(false);
        adminPaneTranslateX.setValue(screenWidth);
        onClosed?.();
      });
    },
    [adminPaneTranslateX, lessonAdminPanelOpen, screenWidth],
  );

  const handleDeleteCourse = useCallback(
    (course: Course) => {
      const courseId = String(course._id || "");
      if (!courseId || deletingCourseId) {
        return;
      }

      Alert.alert(
        "Kursni o'chirish",
        `Rostdan ham ${course.name || "shu kursni"} o'chirmoqchimisiz? Bu amalni keyin tiklab bo'lmaydi.`,
        [
          { text: "Yo'q, qolsin", style: "cancel" },
          {
            text: "Ha, o'chirish",
            style: "destructive",
            onPress: () => {
              void (async () => {
                setDeletingCourseId(courseId);
                try {
                  await deleteCourseMutation.mutateAsync(courseId);
                  if (
                    selectedCourseId === courseId ||
                    selectedCourseId === String(course.urlSlug || "")
                  ) {
                    handleCloseCourseDetail();
                  }
                } catch (error) {
                  Alert.alert(
                    "Kursni o'chirishda xatolik yuz berdi",
                    error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
                  );
                } finally {
                  setDeletingCourseId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [deleteCourseMutation, deletingCourseId, handleCloseCourseDetail, selectedCourseId],
  );

  const handleSelectLesson = async (lesson: CourseLesson) => {
    setSelectedLessonId(lesson._id || lesson.urlSlug || null);
    if (currentCourse?._id && lesson._id) {
      void coursesApi.incrementViews(currentCourse._id, lesson._id).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["course", selectedCourseId] });
      });
    }
  };

  const handleRetryPlayback = () => {
    setPlaybackRetryNonce((value) => value + 1);
  };

  const handleOpenLessonInJammWeb = useCallback(async () => {
    const url = resolveJammWebCourseLessonUrl(currentCourse, currentLesson);
    await Linking.openURL(url).catch(() => {
      Alert.alert("Jamm web ochilmadi", url);
    });
  }, [currentCourse, currentLesson]);

  const handleOpenMedia = async () => {
    const media =
      currentLesson?.mediaItems?.[0] ||
      (currentLesson?.videoUrl || currentLesson?.fileUrl
        ? {
            videoUrl: currentLesson.videoUrl,
            fileUrl: currentLesson.fileUrl,
          }
        : null);
    const mediaUrl = media?.videoUrl || media?.fileUrl || "";

    if (!mediaUrl) {
      Alert.alert("Media topilmadi", "Bu dars uchun media fayl mavjud emas.");
      return;
    }

    if (!canAccessCurrentLesson) {
      Alert.alert("Dars qulflangan", "Bu darsni ochish uchun kursga kirish kerak.");
      return;
    }

    await Linking.openURL(mediaUrl).catch(() => {
      Alert.alert("Media ochilmadi", mediaUrl);
    });
  };

  const handleDeleteLesson = async (lesson: CourseLesson) => {
    if (!currentCourse?._id || !lesson._id) return;
    Alert.alert("Darsni o'chirish", "Haqiqatan ham darsni olib tashlamoqchimisiz?", [
      { text: "Bekor qilish", style: "cancel" },
      {
        text: "O'chirish",
        style: "destructive",
        onPress: async () => {
          await coursesApi.deleteLesson(currentCourse._id || "", lesson._id || "");
          await invalidateCourseDetail();
        },
      },
    ]);
  };

  const handleOpenHomeworkSubmit = (assignment: CourseHomeworkAssignment) => {
    setSelectedHomework(assignment);
    setHomeworkSubmitOpen(true);
  };

  const handleCopyCourseLink = async () => {
    const slug = currentCourse?.urlSlug || currentCourse?._id || currentCourse?.id;
    if (!slug) return;
    await Clipboard.setStringAsync(`/courses/${slug}`);
    await Haptics.selectionAsync();
    Alert.alert("Nusxalandi", "Kurs havolasi clipboard'ga saqlandi.");
  };

  const handleCopyLessonLink = async (lesson: CourseLesson) => {
    const courseSlug = currentCourse?.urlSlug || currentCourse?._id || currentCourse?.id;
    const lessonSlug = lesson.urlSlug || lesson._id || lesson.id;
    if (!courseSlug || !lessonSlug) return;
    await Clipboard.setStringAsync(`/courses/${courseSlug}/${lessonSlug}`);
    await Haptics.selectionAsync();
  };

  const animateToViewMode = useCallback(
    (nextMode: CourseViewMode, withHaptics = false) => {
      if (withHaptics) {
        void Haptics.selectionAsync();
      }

      const nextIndex = nextMode === "arena" ? 1 : 0;
      currentIndexRef.current = nextIndex;
      setViewMode(nextMode);
      pagerRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: true,
      });
    },
    [screenWidth],
  );

  useEffect(() => {
    const nextCourseId = String(routeParams?.courseId || "").trim();
    const nextLessonId = String(routeParams?.lessonId || "").trim();
    const nextViewMode = routeParams?.viewMode;

    if (!nextCourseId && !nextLessonId && !nextViewMode) {
      return;
    }

    if (nextCourseId) {
      if (detailOnly) {
        setSelectedCourseId(nextCourseId);
        setSelectedLessonId(nextLessonId || null);
        setPlaylistCollapsed(false);
        setViewMode("courses");
      } else {
        (navigation as any).navigate("CourseDetail", {
          courseId: nextCourseId,
          lessonId: nextLessonId || undefined,
        });
        (navigation as any).setParams({
          courseId: undefined,
          lessonId: undefined,
          viewMode: undefined,
        });
      }
    } else if (nextViewMode === "arena") {
      animateToViewMode("arena");
    } else if (nextViewMode === "courses") {
      animateToViewMode("courses");
    }

    if (!detailOnly) {
      (navigation as any).setParams({
        courseId: undefined,
        lessonId: undefined,
        viewMode: undefined,
      });
    }
  }, [
    animateToViewMode,
    detailOnly,
    navigation,
    routeParams?.courseId,
    routeParams?.lessonId,
    routeParams?.viewMode,
  ]);

  const handleOpenLinkedTest = async (linkedTest: CourseLinkedTest) => {
    if (!currentCourse?._id || !currentLesson?._id) return;

    setArenaLoading(true);
    try {
      if (linkedTest.resourceType === "sentenceBuilder") {
        const payload = linkedTest.shareShortCode
          ? await arenaApi.fetchSharedSentenceBuilderDeck(linkedTest.shareShortCode)
          : await arenaApi.fetchSentenceBuilderDeck(
              String(linkedTest.resourceId || linkedTest.testId || ""),
            );
        setActiveLinkedTest(linkedTest);
        setActiveSentenceDeck(
          ((payload && typeof payload === "object" && "deck" in payload ? payload.deck : payload) ||
            null) as SentenceBuilderDeck | null,
        );
        setActiveArenaTest(null);
        return;
      }

      const testId = String(linkedTest.testId || linkedTest.resourceId || "");
      if (!testId) {
        if (linkedTest.url) {
          await openJammAwareLink(linkedTest.url).catch(() => {
            Alert.alert("Mashq ochilmadi", linkedTest.url || "");
          });
        }
        return;
      }

      const payload = linkedTest.shareShortCode
        ? await arenaApi.fetchSharedTestByCode(linkedTest.shareShortCode)
        : await arenaApi.fetchTestById(testId);
      setActiveLinkedTest(linkedTest);
      setActiveArenaTest(payload as ArenaTestPayload);
      setActiveSentenceDeck(null);
    } catch (error) {
      Alert.alert(
        t("coursePlayer.lessonTests.openError"),
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setArenaLoading(false);
    }
  };

  const handleCloseArenaPlayer = () => {
    setActiveLinkedTest(null);
    setActiveArenaTest(null);
    setActiveSentenceDeck(null);
  };

  const handleOpenArenaItem = (item: ArenaItem) => {
    if (item.key === "tests") {
      (navigation as any).navigate("ArenaQuizList");
      return;
    }

    if (item.key === "flashcards") {
      (navigation as any).navigate("ArenaFlashcardList");
      return;
    }

    if (item.key === "sentenceBuilders") {
      (navigation as any).navigate("ArenaSentenceBuilderList");
      return;
    }

    if (item.key === "mnemonics") {
      (navigation as any).navigate("ArenaMnemonics");
      return;
    }

    Alert.alert(
      item.title,
      "Bu maydon bo'limining mobile screeni keyingi bosqichda frontdagidek ko'chiriladi.",
    );
  };

  const handleSubmitArenaTest = async (payload: {
    answers?: number[];
    sentenceBuilderAnswers?: Array<{ questionIndex: number; selectedTokens: string[] }>;
  }) => {
    if (activeLinkedTest?.linkedTestId && currentCourse?._id && currentLesson?._id) {
      const result = await coursesApi.submitLessonLinkedTestAttempt(
        currentCourse._id,
        currentLesson._id,
        activeLinkedTest.linkedTestId,
        payload,
      );
      await invalidateCourseDetail();
      return result;
    }

    if (!activeArenaTest?._id) {
      return null;
    }

    return arenaApi.submitTestAnswers(activeArenaTest._id, {
      answers: payload.answers || [],
      shareShortCode: null,
    });
  };

  const renderCurrentLessonStage = () => {
    const offlineBusy = offlineDownloading || offlineRemoving;
    const offlineButtonLabel = offlineDownloading
      ? t("coursePlayer.offline.downloading")
      : offlineRemoving
        ? t("coursePlayer.offline.removing")
        : isLessonFullyOffline
          ? t("coursePlayer.offline.ready")
          : t("coursePlayer.offline.download");

    if (canRenderLessonPlayer) {
      return (
        <View style={styles.playerStageCard}>
          <View style={styles.videoStage}>
            {!isLessonVideoFullscreen && !playbackStreamUrl ? (
              <View style={styles.videoStageTopBar}>
                <Pressable
                  style={styles.videoStageBackButton}
                  onPress={handleCloseCourseDetail}
                >
                  <ArrowLeft size={18} color="#fff" />
                </Pressable>
                <Text style={styles.videoStageTopTitle} numberOfLines={1}>
                  {currentLessonHeaderTitle}
                </Text>
                {canUseOfflineLessonCache && lessonMediaItems.length > 0 ? (
                  <View style={styles.videoStageTopActions}>
                    <View style={styles.videoStageTopActionAnchor}>
                      {offlineTooltipVisible ? (
                        <View style={styles.videoStageTooltip}>
                          <Text style={styles.videoStageTooltipText}>{offlineButtonLabel}</Text>
                        </View>
                      ) : null}
                      <Pressable
                        style={[
                          styles.videoStageTopActionButton,
                          isLessonFullyOffline && styles.videoStageTopActionButtonReady,
                          offlineBusy && styles.sendButtonDisabled,
                        ]}
                        disabled={offlineBusy}
                        delayLongPress={260}
                        onLongPress={() => {
                          offlineTooltipSuppressPressRef.current = true;
                          showOfflineTooltip();
                        }}
                        onPress={() => {
                          if (offlineTooltipSuppressPressRef.current) {
                            offlineTooltipSuppressPressRef.current = false;
                            return;
                          }
                          setOfflineTooltipVisible(false);
                          clearOfflineTooltipTimer();
                          void handleToggleLessonOffline();
                        }}
                      >
                        {offlineBusy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons
                            name={isLessonFullyOffline ? "cloud-done-outline" : "arrow-down"}
                            size={17}
                            color="#fff"
                          />
                        )}
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
            {playbackLoading ? (
              <View style={styles.videoStageCenter}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : playbackError ? (
              <View style={styles.videoStageCenter}>
                <AlertCircle size={30} color={Colors.warning} />
                <Text style={styles.emptyTitle}>Video ochilmadi</Text>
                <Text style={styles.emptyText}>{playbackError}</Text>
              </View>
            ) : playbackStreamUrl ? (
              <>
                <VideoView
                  ref={videoViewRef}
                  player={lessonVideoPlayer}
                  style={styles.videoView}
                  nativeControls={isLessonVideoFullscreen}
                  contentFit="contain"
                  surfaceType={Platform.OS === "android" ? "textureView" : undefined}
                  fullscreenOptions={{ enable: true, orientation: "landscape" }}
                  onFullscreenEnter={() => setIsLessonVideoFullscreen(true)}
                  onFullscreenExit={() => setIsLessonVideoFullscreen(false)}
                />
                {!isLessonVideoFullscreen ? (
                  <>
                    <Pressable style={styles.videoStageTouchLayer} onPress={handleVideoSurfacePress} />
                    {videoChromeVisible ? (
                      <View pointerEvents="box-none" style={styles.videoStageOverlay}>
                        <LinearGradient
                          colors={["rgba(7,10,18,0.78)", "rgba(7,10,18,0.08)"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.videoStageTopGradient}
                        >
                          <View style={styles.videoStageTopBar}>
                            <Pressable
                              style={styles.videoStageBackButton}
                              onPress={handleCloseCourseDetail}
                            >
                              <ArrowLeft size={18} color="#fff" />
                            </Pressable>
                            <View style={styles.videoStageTitleWrap}>
                              <Text style={styles.videoStageTopTitle} numberOfLines={1}>
                                {currentLessonHeaderTitle}
                              </Text>
                              <Text style={styles.videoStageSubtitle} numberOfLines={1}>
                                {currentCourse?.name || "Jamm Course"} · {playbackSourceLabel}
                              </Text>
                            </View>
                            <View style={styles.videoStageTopActions}>
                             
                              {canUseOfflineLessonCache && lessonMediaItems.length > 0 ? (
                                <View style={styles.videoStageTopActionAnchor}>
                                  {offlineTooltipVisible ? (
                                    <View style={styles.videoStageTooltip}>
                                      <Text style={styles.videoStageTooltipText}>
                                        {offlineButtonLabel}
                                      </Text>
                                    </View>
                                  ) : null}
                                  <Pressable
                                    style={[
                                      styles.videoStageTopActionButton,
                                      isLessonFullyOffline && styles.videoStageTopActionButtonReady,
                                      offlineBusy && styles.sendButtonDisabled,
                                    ]}
                                    disabled={offlineBusy}
                                    delayLongPress={260}
                                    onLongPress={() => {
                                      offlineTooltipSuppressPressRef.current = true;
                                      showOfflineTooltip();
                                    }}
                                    onPress={() => {
                                      if (offlineTooltipSuppressPressRef.current) {
                                        offlineTooltipSuppressPressRef.current = false;
                                        return;
                                      }
                                      setOfflineTooltipVisible(false);
                                      clearOfflineTooltipTimer();
                                      showVideoChrome();
                                      void handleToggleLessonOffline();
                                    }}
                                  >
                                    {offlineBusy ? (
                                      <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                      <Ionicons
                                        name={
                                          isLessonFullyOffline
                                            ? "cloud-done-outline"
                                            : "arrow-down"
                                        }
                                        size={17}
                                        color="#fff"
                                      />
                                    )}
                                  </Pressable>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </LinearGradient>

                        <View style={styles.videoStageCenterControls}>
                          <Pressable
                            style={styles.videoStageSeekButton}
                            onPress={() => handleSeekRelative(-10)}
                          >
                            <Ionicons name="play-back" size={22} color="#fff" />
                          </Pressable>
                          <Pressable
                            style={styles.videoStagePlayButton}
                            onPress={handleToggleVideoPlayback}
                          >
                            {isLessonVideoStarting ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Ionicons
                                name={isLessonVideoPlaying ? "pause" : "play"}
                                size={24}
                                color="#fff"
                                style={!isLessonVideoPlaying ? styles.videoStagePlayIcon : undefined}
                              />
                            )}
                          </Pressable>
                          <Pressable
                            style={styles.videoStageSeekButton}
                            onPress={() => handleSeekRelative(10)}
                          >
                            <Ionicons name="play-forward" size={22} color="#fff" />
                          </Pressable>
                        </View>

                        <LinearGradient
                          colors={["rgba(7,10,18,0.08)", "rgba(7,10,18,0.9)"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={[
                            styles.videoStageBottomBar,
                            { paddingBottom: 4 },
                          ]}
                        >
                          

                          <View
                            style={styles.videoStageProgressTrack}
                            onLayout={(event) =>
                              setVideoProgressTrackWidth(event.nativeEvent.layout.width)
                            }
                            onStartShouldSetResponder={() => true}
                            onMoveShouldSetResponder={() => true}
                            onResponderGrant={(event) => {
                              showVideoChrome();
                              updateVideoScrubPreview(event.nativeEvent.locationX);
                            }}
                            onResponderMove={(event) => {
                              updateVideoScrubPreview(event.nativeEvent.locationX);
                            }}
                            onResponderRelease={(event) => {
                              showVideoChrome();
                              finishVideoScrub(event.nativeEvent.locationX);
                            }}
                            onResponderTerminate={() => {
                              setVideoScrubPercent(null);
                            }}
                          >
                            <View
                              style={[
                                styles.videoStageProgressBuffered,
                                { width: `${bufferedProgressPercent}%` },
                              ]}
                            />
                            <View
                              style={[
                                styles.videoStageProgressElapsed,
                                { width: `${displayedProgressPercent}%` },
                              ]}
                            />
                            <View
                              style={[
                                styles.videoStageProgressThumb,
                                { left: `${displayedProgressPercent}%` },
                              ]}
                            />
                            {segmentBoundaries.map((boundary, index) => (
                              <View
                                key={`segment-${index}`}
                                style={[styles.videoStageProgressMarker, { left: `${boundary}%` }]}
                              />
                            ))}
                          </View>

                          <View style={styles.videoStageControlsRow}>
                            <View style={styles.videoStageMetaRow}>
                            <View style={styles.videoStageMetaBadge}>
                              <Text style={styles.videoStageMetaBadgeText}>
                                {activeMediaIndex + 1}/{Math.max(lessonMediaItems.length, 1)}
                              </Text>
                            </View>
                          </View>
                            <Text style={styles.videoStageTimeText}>
                              {formatPlaybackClock(overallCurrentTime)} /{" "}
                              {formatPlaybackClock(totalLessonDuration)}
                            </Text>

                            <Pressable
                              style={styles.videoStageControlButtonWide}
                              onPress={() => setPlayerSettingsOpen(true)}
                            >
                              <Ionicons name="options-outline" size={16} color="#fff" />
                              <Text style={styles.videoStageControlButtonText}>Sozlamalar</Text>
                            </Pressable>

                            <Pressable
                              style={styles.videoStageControlButton}
                              onPress={handleEnterVideoFullscreen}
                            >
                              <Ionicons
                                name={isLessonVideoFullscreen ? "contract-outline" : "expand-outline"}
                                size={16}
                                color="#fff"
                              />
                            </Pressable>
                          </View>
                        </LinearGradient>
                      </View>
                    ) : (
                      <View pointerEvents="none" style={styles.videoStageMiniProgressWrap}>
                        <View
                          style={[
                            styles.videoStageMiniProgress,
                            { width: `${overallProgressPercent}%` },
                          ]}
                        />
                      </View>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              <View style={styles.videoStageCenter}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            )}
          </View>
        </View>
      );
    }

    let icon = <LogIn size={30} color={Colors.subtleText} />;
    let title = "Kursga yoziling";
    let description =
      "Darslarni ko'rish uchun avval kursga yozilish kerak. Admin tasdiqlangandan keyin darslarni ko'rishingiz mumkin.";

    if (!currentCourseLessons.length || !currentLesson) {
      icon = <ListVideo size={30} color={Colors.subtleText} />;
      title = "No lessons added yet";
      description = isOwner
        ? "Bu kursda hali dars yaratilmagan. Yangi dars qo'shib boshlashingiz mumkin."
        : "Bu kursga hali darslar qo'shilmagan.";
    } else if (currentLesson?.status === "draft") {
      icon = <Clock3 size={30} color={Colors.warning} />;
      title = "Draft dars";
      description = isOwner
        ? "Dars draft holatda turibdi. Media biriktirib e'lon qiling yoki tahrirlashni davom ettiring."
        : "Bu dars hali e'lon qilinmagan.";
    } else if (currentLesson && !currentLessonHasMedia) {
      icon = <AlertCircle size={30} color={Colors.warning} />;
      title = "Media biriktirilmagan";
      description = isOwner
        ? "Dars yaratilgan, lekin hali video yoki fayl biriktirilmagan."
        : "Bu dars uchun video yoki fayl hali tayyor emas.";
    } else if (
      Array.isArray(currentLesson?.accessLockedByTests) &&
      currentLesson.accessLockedByTests.length > 0
    ) {
      icon = <Shield size={30} color={Colors.warning} />;
      title = "Avval testni ishlang";
      description =
        "Keyingi darsni ochish uchun oldingi darsdagi majburiy testdan o'tish kerak.";
    } else if (isPendingMember) {
      icon = <Clock3 size={30} color={Colors.warning} />;
      title = "So'rov yuborildi";
      description =
        "Sizning so'rovingiz admin tomonidan ko'rib chiqilmoqda. Iltimos kuting.";
    }

    return (
      <View style={styles.playerStageCard}>
        <View style={styles.videoStageFallback}>
          <View style={styles.videoStageTopBar}>
            <Pressable
              style={styles.videoStageBackButton}
              onPress={handleCloseCourseDetail}
            >
              <ArrowLeft size={18} color="#fff" />
            </Pressable>
            <Text style={styles.videoStageTopTitle} numberOfLines={1}>
              {currentLessonHeaderTitle}
            </Text>
          </View>
          <View style={styles.videoStageCenter}>
            {icon}
            <Text style={styles.emptyTitle}>{title}</Text>
            <Text style={styles.emptyText}>{description}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCurrentLessonInfo = () => {
    if (!currentLesson || !canRenderLessonPlayer) return null;

    return (
      <LessonInfoSection
        visible
        views={currentLesson.views || 0}
        likes={currentLesson.likes || 0}
        liked={Boolean(currentLesson.liked)}
        onLike={() =>
          currentCourse?._id && currentLesson?._id
            ? likeLessonMutation.mutate({
                courseId: currentCourse._id,
                lessonId: currentLesson._id,
              })
            : undefined
        }
        onCopy={() => void handleCopyLessonLink(currentLesson)}
        description={currentLesson.description}
        onOpenDescription={() => setLessonDescriptionSheetOpen(true)}
        mediaCount={lessonMediaItems.length}
        activeMediaIndex={activeMediaIndex}
      />
    );
  };

  const handleOpenAdminLessonEditor = () => {
    const adminPaneLesson = currentLesson || currentCourseLessons[0] || null;
    if (!adminPaneLesson) return;
    handleCloseLessonAdminPanel(() => {
      setEditingLesson(adminPaneLesson);
      setLessonEditorOpen(true);
    });
  };

  const openAdminChildModal = useCallback(
    (kind: "material" | "linked-test" | "homework") => {
      if (kind === "material") {
        setMaterialModalOpen(true);
        return;
      }
      if (kind === "linked-test") {
        setLinkedTestModalOpen(true);
        return;
      }
      setHomeworkModalOpen(true);
    },
    [],
  );

  const handlePublishCurrentLesson = async () => {
    if (!currentCourse?._id || !currentLesson?._id) return;
    try {
      await coursesApi.publishLesson(currentCourse._id, currentLesson._id);
      await invalidateCourseDetail();
    } catch (error) {
      Alert.alert(
        "Dars publish bo'lmadi",
        error instanceof Error ? error.message : "Xatolik yuz berdi.",
      );
    }
  };

  const handleDeleteLessonMaterial = (materialId?: string) => {
    if (!currentCourse?._id || !currentLesson?._id || !materialId) return;
    Alert.alert("Materialni o'chirish", "Bu material olib tashlansinmi?", [
      { text: "Bekor qilish", style: "cancel" },
      {
        text: "O'chirish",
        style: "destructive",
        onPress: () => {
          void coursesApi
            .deleteLessonMaterial(currentCourse._id || "", currentLesson._id || "", materialId)
            .then(() => invalidateCourseDetail())
            .catch((error) =>
              Alert.alert(
                "Material o'chmadi",
                error instanceof Error ? error.message : "Xatolik yuz berdi.",
              ),
            );
        },
      },
    ]);
  };

  const handleDeleteLinkedTest = (linkedTestId?: string) => {
    if (!currentCourse?._id || !currentLesson?._id || !linkedTestId) return;
    Alert.alert("Testni uzish", "Bu linked test darsdan olib tashlansinmi?", [
      { text: "Bekor qilish", style: "cancel" },
      {
        text: "O'chirish",
        style: "destructive",
        onPress: () => {
          void coursesApi
            .deleteLessonLinkedTest(currentCourse._id || "", currentLesson._id || "", linkedTestId)
            .then(() => invalidateCourseDetail())
            .catch((error) =>
              Alert.alert(
                "Test o'chmadi",
                error instanceof Error ? error.message : "Xatolik yuz berdi.",
              ),
            );
        },
      },
    ]);
  };

  const handleDeleteHomeworkAssignment = (assignmentId?: string) => {
    if (!currentCourse?._id || !currentLesson?._id || !assignmentId) return;
    Alert.alert("Homeworkni o'chirish", "Bu topshiriq olib tashlansinmi?", [
      { text: "Bekor qilish", style: "cancel" },
      {
        text: "O'chirish",
        style: "destructive",
        onPress: () => {
          void coursesApi
            .deleteLessonHomework(currentCourse._id || "", currentLesson._id || "", assignmentId)
            .then(() => invalidateCourseDetail())
            .catch((error) =>
              Alert.alert(
                "Homework o'chmadi",
                error instanceof Error ? error.message : "Xatolik yuz berdi.",
              ),
            );
        },
      },
    ]);
  };

  const handleApproveMember = async (userId?: string) => {
    if (!currentCourse?._id || !userId) return;
    setMemberActionTargetId(userId);
    try {
      await approveCourseMemberMutation.mutateAsync({
        courseId: currentCourse._id,
        userId,
      });
    } catch (error) {
      Alert.alert(
        "A'zoni tasdiqlab bo'lmadi",
        error instanceof Error ? error.message : "Xatolik yuz berdi.",
      );
    } finally {
      setMemberActionTargetId(null);
    }
  };

  const handleRemoveMember = async (userId?: string, label = "A'zo") => {
    if (!currentCourse?._id || !userId) return;
    setMemberActionTargetId(userId);
    try {
      await removeCourseMemberMutation.mutateAsync({
        courseId: currentCourse._id,
        userId,
      });
    } catch (error) {
      Alert.alert(
        `${label}ni o'chirib bo'lmadi`,
        error instanceof Error ? error.message : "Xatolik yuz berdi.",
      );
    } finally {
      setMemberActionTargetId(null);
    }
  };

  const handleAttendanceStatusChange = async (
    userId?: string,
    status: "present" | "late" | "absent" = "absent",
  ) => {
    if (!currentCourse?._id || !currentLesson?._id || !userId) return;
    setAttendanceActionTargetId(userId);
    try {
      await attendanceStatusMutation.mutateAsync({
        courseId: currentCourse._id,
        lessonId: currentLesson._id,
        userId,
        status,
      });
    } catch (error) {
      Alert.alert(
        "Davomat yangilanmadi",
        error instanceof Error ? error.message : "Xatolik yuz berdi.",
      );
    } finally {
      setAttendanceActionTargetId(null);
    }
  };

  const openOralEditor = (row: CourseLessonGradingRow) => {
    const rowUserId = String(row.userId || "");
    if (!rowUserId) return;
    setEditingOralRows((current) => ({ ...current, [rowUserId]: true }));
    setOralScoreDrafts((current) => ({
      ...current,
      [rowUserId]:
        current[rowUserId] !== undefined
          ? current[rowUserId]
          : row.oralScore === null || row.oralScore === undefined
            ? ""
            : String(row.oralScore),
    }));
    setOralNoteDrafts((current) => ({
      ...current,
      [rowUserId]: current[rowUserId] !== undefined ? current[rowUserId] : row.oralNote || "",
    }));
  };

  const closeOralEditor = (userId?: string) => {
    const rowUserId = String(userId || "");
    if (!rowUserId) return;
    setEditingOralRows((current) => ({ ...current, [rowUserId]: false }));
  };

  const handleSaveOralAssessment = async (userId?: string) => {
    const rowUserId = String(userId || "");
    if (!currentCourse?._id || !currentLesson?._id || !rowUserId) return;
    setOralSavingUserId(rowUserId);
    try {
      await oralAssessmentMutation.mutateAsync({
        courseId: currentCourse._id,
        lessonId: currentLesson._id,
        userId: rowUserId,
        score:
          oralScoreDrafts[rowUserId] === undefined || oralScoreDrafts[rowUserId] === ""
            ? null
            : Number(oralScoreDrafts[rowUserId]),
        note: oralNoteDrafts[rowUserId] || "",
      });
      setEditingOralRows((current) => ({ ...current, [rowUserId]: false }));
    } catch (error) {
      Alert.alert(
        "Og'zaki baho saqlanmadi",
        error instanceof Error ? error.message : "Xatolik yuz berdi.",
      );
    } finally {
      setOralSavingUserId(null);
    }
  };

  const renderAdminMaterialsCard = () => (
    <AdminMaterialsSection
      materials={lessonMaterials}
      formatFileSize={formatFileSize}
      onAdd={() => openAdminChildModal("material")}
      onDelete={handleDeleteLessonMaterial}
    />
  );

  const renderAdminTestsTab = () => (
    <AdminTestsSection
      linkedTests={linkedTests}
      onAdd={() => openAdminChildModal("linked-test")}
      onStart={(item) => void handleOpenLinkedTest(item)}
      onDelete={handleDeleteLinkedTest}
    />
  );

  const renderAdminHomeworkTab = () => (
    <AdminHomeworkSection
      assignments={homeworkAssignments}
      onAdd={() => openAdminChildModal("homework")}
      onDelete={handleDeleteHomeworkAssignment}
      timeAgo={formatRelativeTime}
    />
  );

  const renderAdminAttendanceTab = () => (
    <AdminAttendanceSection
      loading={attendanceQuery.isLoading}
      attendance={attendanceData}
      actionTargetId={attendanceActionTargetId}
      onStatusChange={(memberId, status) => void handleAttendanceStatusChange(memberId, status)}
    />
  );

  const renderAdminGradingTab = () => (
    <AdminGradingSection
      loading={gradingQuery.isLoading}
      grading={grading}
      editingRows={editingOralRows}
      savingUserId={oralSavingUserId}
      oralScoreDrafts={oralScoreDrafts}
      oralNoteDrafts={oralNoteDrafts}
      onOpenEditor={openOralEditor}
      onCloseEditor={closeOralEditor}
      onScoreDraftChange={(userId, value) =>
        setOralScoreDrafts((current) => ({
          ...current,
          [userId]: value.replace(/[^0-9]/g, ""),
        }))
      }
      onNoteDraftChange={(userId, value) =>
        setOralNoteDrafts((current) => ({
          ...current,
          [userId]: value,
        }))
      }
      onSave={(userId) => void handleSaveOralAssessment(userId)}
    />
  );

  const renderAdminMembersTab = () => (
    <AdminMembersSection
      pendingMembers={pendingMembers}
      approvedMembers={approvedMembers}
      actionTargetId={memberActionTargetId}
      getMemberId={(member) => getCourseMemberUserId(member)}
      getMemberName={getCourseMemberName}
      getMemberAvatar={(member) => getCourseMemberAvatar(member)}
      onApprove={(memberId) => void handleApproveMember(memberId)}
      onRemove={(memberId, label) => void handleRemoveMember(memberId, label)}
    />
  );

  const renderAdminTabContent = () => {
    switch (adminActiveTab) {
      case "tests":
        return renderAdminTestsTab();
      case "attendance":
        return renderAdminAttendanceTab();
      case "grading":
        return renderAdminGradingTab();
      case "members":
        return renderAdminMembersTab();
      case "homework":
      default:
        return renderAdminHomeworkTab();
    }
  };

  const renderOwnerLessonAdminModal = () => {
    return (
      <CourseAdminPane
        visible={lessonAdminPanelOpen}
        isOwner={isOwner}
        isWeb={Platform.OS === "web"}
        backdropOpacity={adminPaneBackdropOpacity}
        translateX={adminPaneTranslateX}
        currentCourseName={currentCourse?.name}
        currentLesson={currentLesson || currentCourseLessons[0] || null}
        lessons={currentCourseLessons}
        selectedLessonId={currentLesson?._id || currentLesson?.urlSlug || null}
        selectedHasMedia={selectedHasMedia}
        publishedLessonsCount={publishedLessonsCount}
        draftLessonsCount={draftLessonsCount}
        approvedMembersCount={approvedMembers.length}
        activeTab={adminActiveTab}
        onTabChange={setAdminActiveTab}
        onClose={handleCloseLessonAdminPanel}
        onEdit={handleOpenAdminLessonEditor}
        onPublish={() => void handlePublishCurrentLesson()}
        onDelete={(lesson) => void handleDeleteLesson(lesson)}
        onSelectLesson={(lesson) => void handleSelectLesson(lesson)}
        materialsCard={renderAdminMaterialsCard()}
        tabContent={renderAdminTabContent()}
      />
    );
  };

  const renderEnrollmentSection = () => (
    <EnrollmentSection
      ownerName={courseOwnerName}
      ownerAvatar={courseOwnerAvatar}
      memberCount={getCourseMemberCount(currentCourse)}
      actionSlot={
        isOwner ? (
          <Pressable
            style={[styles.roundedActionButton, styles.roundedActionButtonAdmin]}
            onPress={() => {
              if (!selectedLessonId && currentCourseLessons[0]) {
                setSelectedLessonId(
                  currentCourseLessons[0]._id || currentCourseLessons[0].urlSlug || null,
                );
              }
              setAdminActiveTab("homework");
              setLessonAdminPanelOpen(true);
            }}
          >
            <Shield size={15} color={Colors.primary} />
            <Text style={[styles.roundedActionButtonText, styles.roundedActionButtonTextAdmin]}>
              {t("coursePlayer.actions.manage")}
            </Text>
          </Pressable>
        ) : isPendingMember ? (
          <View style={[styles.roundedActionButton, styles.roundedActionButtonPending]}>
            <Clock3 size={15} color={Colors.warning} />
            <Text style={[styles.roundedActionButtonText, styles.roundedActionButtonTextPending]}>
              {t("coursePlayer.actions.pending")}
            </Text>
          </View>
        ) : isApprovedMember ? (
          <View style={[styles.roundedActionButton, styles.roundedActionButtonSuccess]}>
            <CheckCircle2 size={15} color={Colors.accent} />
            <Text style={[styles.roundedActionButtonText, styles.roundedActionButtonTextSuccess]}>
              {t("coursePlayer.actions.enrolled")}
            </Text>
          </View>
        ) : (
          <Pressable
            style={[styles.roundedActionButton, styles.roundedActionButtonPrimary]}
            disabled={enrollMutation.isPending || !currentCourse?._id}
            onPress={() =>
              currentCourse?._id ? enrollMutation.mutate(currentCourse._id) : undefined
            }
          >
            {enrollMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <UserPlus size={15} color="#fff" />
                <Text style={styles.roundedActionButtonText}>
                  {currentCourse?.accessType === "paid"
                    ? t("coursePlayer.actions.buy", { price: currentCourse?.price || 0 })
                    : t("coursePlayer.actions.enroll")}
                </Text>
              </>
            )}
          </Pressable>
        )
      }
    />
  );

  const indicatorTranslateX =
    tabsWidth > 0
      ? pagerScrollX.interpolate({
          inputRange: [0, screenWidth],
          outputRange: [0, tabsWidth / 2],
          extrapolate: "clamp",
        })
      : 0;

  const renderCoursesListPage = () => {
    if (coursesQuery.isLoading) {
      return (
        <View style={styles.loaderState}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }

    if (filteredCourses.length === 0) {
      return (
        <View style={styles.emptyState}>
          <BookOpen size={28} color={Colors.mutedText} />
          <Text style={styles.emptyTitle}>{t("courseSidebar.searchEmptyTitle")}</Text>
          <Text style={styles.emptyText}>
            {query.trim()
              ? t("courseSidebar.searchEmptyDescription")
              : t("courseSidebar.emptyDescription")}
          </Text>
        </View>
      );
    }

    return filteredCourses.map((course) => {
      const memberStatus = getCourseMemberStatus(course, currentUserId);
      const lessonCount = getCourseLessonCount(course);
      const memberCount = getCourseMemberCount(course);
      const statusLabel = memberStatus
        ? t(`courseSidebar.status.${memberStatus}`)
        : "";
      const isAdminCourse = memberStatus === "admin";
      const isDeletingCourse = deletingCourseId === String(course._id || "");
      const isActiveCourse =
        selectedCourseId === String(course._id || "") ||
        selectedCourseId === String(course.urlSlug || "");
      const gradientColors = getCourseGradientColors(course.gradient);

      return (
        <Pressable
          key={course._id || course.urlSlug}
          style={({ pressed }) => [
            styles.sidebarCourseItem,
            isActiveCourse && styles.sidebarCourseItemActive,
            pressed && styles.sidebarCourseItemPressed,
          ]}
          onPress={() => void handleOpenCourse(course)}
        >
          <View
            style={[
              styles.sidebarCourseAccent,
              !isActiveCourse && styles.sidebarCourseAccentHidden,
            ]}
          />
          {course.image ? (
            <PersistentCachedImage
              remoteUri={course.image}
              style={styles.sidebarCourseThumb}
            />
          ) : (
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sidebarCourseThumbFallback}
            >
              <Text style={styles.courseThumbLetter}>
                {(course.name || "?").charAt(0)}
              </Text>
            </LinearGradient>
          )}

          <View style={styles.sidebarCourseBody}>
            <Text style={styles.courseItemTitle} numberOfLines={1}>
              {course.name}
            </Text>
            <View style={styles.courseDescriptionRow}>
              <Text style={styles.courseItemDescription} numberOfLines={1}>
                {lessonCount > 0
                  ? t("courseSidebar.lessonCount", { count: lessonCount })
                  : t("courseSidebar.noLessons")}
              </Text>
              {statusLabel ? (
                <View
                  style={[
                    styles.courseStatusBadge,
                    memberStatus === "pending"
                      ? styles.courseStatusBadgePending
                      : memberStatus === "approved"
                        ? styles.courseStatusBadgeApproved
                        : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.courseStatusBadgeText,
                      memberStatus === "pending"
                        ? styles.courseStatusBadgeTextPending
                        : memberStatus === "approved"
                          ? styles.courseStatusBadgeTextApproved
                          : null,
                    ]}
                  >
                    {statusLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.sidebarCourseMeta}>
            <View style={styles.sidebarCourseMetaRow}>
              <Users size={12} color={Colors.mutedText} />
              <Text style={styles.courseMetaText}>{memberCount}</Text>
            </View>
            {isAdminCourse ? (
              <Pressable
                style={({ pressed }) => [
                  styles.sidebarCourseAction,
                  pressed && styles.sidebarCourseActionPressed,
                ]}
                disabled={isDeletingCourse}
                onPress={(event) => {
                  event.stopPropagation();
                  handleDeleteCourse(course);
                }}
              >
                {isDeletingCourse ? (
                  <ActivityIndicator size="small" color={Colors.danger} />
                ) : (
                  <Trash2 size={14} color={Colors.mutedText} />
                )}
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      );
    });
  };

  const renderArenaPage = () =>
    filteredArenaItems.length === 0 ? (
      <View style={styles.emptyState}>
        <Swords size={28} color={Colors.mutedText} />
        <Text style={styles.emptyTitle}>{t("courseSidebar.arenaEmptyTitle")}</Text>
        <Text style={styles.emptyText}>{t("courseSidebar.arenaEmptyDescription")}</Text>
      </View>
    ) : (
      <>
        {filteredArenaItems.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={item.key}
              style={styles.arenaItem}
              onPress={() => handleOpenArenaItem(item)}
            >
              <View style={styles.arenaThumb}>
                <Icon size={20} color="#fff" />
              </View>
              <View style={styles.arenaBody}>
                <Text style={styles.arenaItemTitle}>{item.title}</Text>
                <Text style={styles.arenaItemDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </>
    );

  const mainContent = (
    <View style={styles.container}>
      <GuidedTourTarget targetKey="courses-search">
        <SearchHeaderBar
          value={query}
          onChangeText={setQuery}
          placeholder={
            viewMode === "arena"
              ? t("courseSidebar.arenaSearchPlaceholder")
              : t("courseSidebar.searchPlaceholder")
          }
          rightSlot={
            viewMode === "courses" ? (
              <GuidedTourTarget targetKey="courses-create">
                <Pressable style={styles.sidebarActionButton} onPress={() => setCreateOpen(true)}>
                  <Plus size={18} color={Colors.text} />
                </Pressable>
              </GuidedTourTarget>
            ) : null
          }
        />
      </GuidedTourTarget>

      <GuidedTourTarget targetKey="courses-tabs">
        <View style={styles.coursesTabsRow}>
        <View
          style={styles.coursesTabsTrack}
          onLayout={(event) => setTabsWidth(event.nativeEvent.layout.width)}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.coursesTabIndicator,
              tabsWidth > 0
                ? {
                    width: tabsWidth / 2,
                    transform: [{ translateX: indicatorTranslateX as any }],
                  }
                : null,
            ]}
          />
        </View>
        <Pressable
          style={styles.coursesTab}
          onPress={() => animateToViewMode("courses", true)}
        >
          <BookOpen
            size={16}
            color={viewMode === "courses" ? Colors.text : Colors.mutedText}
          />
          <Text style={[styles.coursesTabText, viewMode === "courses" && styles.coursesTabTextActive]}>
            {t("courseSidebar.tabs.courses")}
          </Text>
        </Pressable>
        <Pressable
          style={styles.coursesTab}
          onPress={() => animateToViewMode("arena", true)}
        >
          <Swords
            size={16}
            color={viewMode === "arena" ? Colors.text : Colors.mutedText}
          />
          <Text style={[styles.coursesTabText, viewMode === "arena" && styles.coursesTabTextActive]}>
            {t("courseSidebar.tabs.arena")}
          </Text>
        </Pressable>
        </View>
      </GuidedTourTarget>

      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        bounces={false}
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(
            event.nativeEvent.contentOffset.x / Math.max(screenWidth, 1),
          );
          currentIndexRef.current = nextIndex;
          setViewMode(nextIndex === 1 ? "arena" : "courses");
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: pagerScrollX } } }],
          { useNativeDriver: false },
        )}
        style={styles.listPagerTrack}
      >
        <View style={[styles.listPage, { width: screenWidth }]}>
          <GuidedTourTarget targetKey="courses-list" style={styles.flexTarget}>
            <GuidedTourTarget targetKey="courses-content" style={styles.flexTarget}>
              <ScrollView
                style={styles.listScroll}
                contentContainerStyle={styles.listContent}
                refreshControl={
                  <RefreshControl
                    refreshing={listRefreshing}
                    onRefresh={() => void handleRefreshCourses()}
                    tintColor={Colors.primary}
                  />
                }
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {renderCoursesListPage()}
              </ScrollView>
            </GuidedTourTarget>
          </GuidedTourTarget>
        </View>
        <View style={[styles.listPage, { width: screenWidth }]}>
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={listRefreshing}
                onRefresh={() => void handleRefreshCourses()}
                tintColor={Colors.primary}
              />
            }
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {renderArenaPage()}
          </ScrollView>
        </View>
      </Animated.ScrollView>
    </View>
  );

  const detailLayer = selectedCourseId ? (
    <>
      <Animated.View
            style={[
              styles.detailOverlay,
              { transform: [{ translateX: courseDetailTranslateX }] },
            ]}
          >
            <SafeAreaView style={styles.detailSafeArea} edges={["top", "left", "right", "bottom"]}>
            <View style={styles.detailContainer}>
          <PanGestureHandler
            enabled={!detailOnly && !isLessonVideoFullscreen}
            activeOffsetX={24}
            failOffsetY={[-16, 16]}
            shouldCancelWhenOutside={false}
            onGestureEvent={handleCourseSwipeGesture}
            onHandlerStateChange={handleCourseSwipeBack}
          >
            <Animated.View style={styles.detailSwipeEdge} />
          </PanGestureHandler>
          {selectedCourseQuery.isLoading ? (
            <View style={styles.loaderState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : !currentCourse ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Kurs topilmadi</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.detailScroll}
              contentContainerStyle={styles.detailContent}
              showsVerticalScrollIndicator={false}
            >
              {renderCurrentLessonStage()}
              {renderCurrentLessonInfo()}
              {renderEnrollmentSection()}
              <LessonMaterialsSection
                visible={canRenderLessonPlayer && hasLessonMaterials}
                materials={lessonMaterials}
                formatFileSize={formatFileSize}
              />
              <StudentExtrasSection
                visible={!isOwner && canRenderLessonPlayer && hasLessonExtras}
                open={studentExtrasOpen}
                onToggle={() => setStudentExtrasOpen((value) => !value)}
                linkedTests={linkedTests}
                homeworkAssignments={homeworkAssignments}
                onOpenLinkedTest={handleOpenLinkedTest}
                onOpenHomeworkSubmit={handleOpenHomeworkSubmit}
                timeAgo={formatRelativeTime}
              />

              <View style={styles.playlistPanel}>
                <View style={styles.playlistHeader}>
                  <View style={styles.playlistHeaderMain}>
                    <View style={styles.playlistTitleRow}>
                      <ListVideo size={17} color={Colors.text} />
                      <Text style={styles.playlistTitleText}>Darslar</Text>
                    <Text style={styles.playlistCount}>
                      {currentCourseLessons.length} ta dars
                    </Text>
                    </View>
                  </View>
                  <View style={styles.playlistHeaderActions}>
                    <Pressable
                      style={styles.rowIconButton}
                      onPress={() => void handleCopyCourseLink()}
                    >
                      <Copy size={14} color={Colors.subtleText} />
                    </Pressable>
                    {isOwner ? (
                      <Pressable
                        style={styles.rowIconButton}
                        onPress={() => {
                          setEditingLesson(null);
                          setLessonEditorOpen(true);
                        }}
                      >
                        <Plus size={14} color={Colors.primary} />
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={styles.rowIconButton}
                      onPress={() => setPlaylistCollapsed((value) => !value)}
                    >
                      {playlistCollapsed ? (
                        <ChevronDown size={16} color={Colors.subtleText} />
                      ) : (
                        <ChevronUp size={16} color={Colors.subtleText} />
                      )}
                    </Pressable>
                  </View>
                </View>
                {!playlistCollapsed
                  ? currentCourseLessons.map((lesson, index) => {
                        const active =
                          String(lesson._id || lesson.urlSlug || "") ===
                          String(currentLesson?._id || currentLesson?.urlSlug || "");
                        const canOpen = canOpenLesson(lesson);
                        const hasLessonMedia = Boolean(
                          (Array.isArray(lesson.mediaItems) && lesson.mediaItems.length) ||
                            lesson.videoUrl ||
                            lesson.fileUrl,
                        );
                        return (
                          <Pressable
                            key={lesson._id || lesson.urlSlug || index}
                            style={[styles.lessonRow, active && styles.lessonRowActive]}
                            onPress={() => canOpen && void handleSelectLesson(lesson)}
                          >
                            <View style={styles.lessonRowMain}>
                              <View style={[styles.lessonIndex, active && styles.lessonIndexActive]}>
                                {active ? (
                                  <Play size={12} color="#fff" fill="#fff" />
                                ) : canOpen ? (
                                  <Text
                                    style={[
                                      styles.lessonIndexText,
                                      active && styles.lessonIndexTextActive,
                                    ]}
                                  >
                                    {index + 1}
                                  </Text>
                                ) : (
                                  <Lock size={12} color={Colors.warning} />
                                )}
                              </View>
                              <View style={styles.lessonCopy}>
                                <View style={styles.lessonTitleRow}>
                                  <Text
                                    style={[styles.lessonTitle, active && styles.lessonTitleActive]}
                                    numberOfLines={1}
                                  >
                                    {canOpen ? lesson.title : `${index + 1}-dars`}
                                  </Text>
                                  {lesson.status === "draft" ? (
                                    <View style={styles.lessonMiniBadge}>
                                      <Text style={styles.lessonMiniBadgeText}>Draft</Text>
                                    </View>
                                  ) : null}
                                  {index === 0 && !isOwner && !isApprovedMember ? (
                                    <View
                                      style={[
                                        styles.lessonMiniBadge,
                                        styles.lessonMiniBadgeFree,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.lessonMiniBadgeText,
                                          styles.lessonMiniBadgeTextFree,
                                        ]}
                                      >
                                        Bepul
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                                <View style={styles.lessonMetaRow}>
                                  {canOpen ? (
                                    <View style={styles.lessonMetaItem}>
                                      <Eye size={11} color={Colors.subtleText} />
                                      <Text style={styles.lessonMeta}>{lesson.views || 0}</Text>
                                    </View>
                                  ) : (
                                    <Text style={styles.lessonMeta}>Qulflangan dars</Text>
                                  )}
                                </View>
                              </View>
                            </View>
                            <View style={styles.lessonRowActions}>
                              <Pressable
                                style={styles.rowIconButton}
                                onPress={() => void handleCopyLessonLink(lesson)}
                              >
                                <Copy size={14} color={Colors.subtleText} />
                              </Pressable>
                              {isOwner ? (
                                <>
                                  <Pressable
                                    style={styles.rowIconButton}
                                    onPress={() => {
                                      setEditingLesson(lesson);
                                      setLessonEditorOpen(true);
                                    }}
                                  >
                                    <Pencil size={14} color={Colors.primary} />
                                  </Pressable>
                                  {lesson.status === "draft" && lesson._id && hasLessonMedia ? (
                                    <Pressable
                                      style={styles.rowIconButton}
                                      onPress={() =>
                                        currentCourse._id
                                          ? coursesApi
                                              .publishLesson(currentCourse._id, lesson._id || "")
                                              .then(() => invalidateCourseDetail())
                                              .catch((error) =>
                                                Alert.alert(
                                                  "Dars publish bo'lmadi",
                                                  error instanceof Error
                                                    ? error.message
                                                    : "Xatolik",
                                                ),
                                              )
                                          : undefined
                                      }
                                    >
                                      <Check size={14} color={Colors.accent} />
                                    </Pressable>
                                  ) : null}
                                  <Pressable
                                    style={styles.rowIconButton}
                                    onPress={() => void handleDeleteLesson(lesson)}
                                  >
                                    <Trash2 size={14} color={Colors.danger} />
                                  </Pressable>
                                </>
                              ) : !canOpen ? (
                                <Lock size={14} color={Colors.warning} />
                              ) : null}
                            </View>
                          </Pressable>
                        );
                      })
                  : null}
              </View>

            </ScrollView>
          )}
        </View>
        </SafeAreaView>
      </Animated.View>

      <DraggableBottomSheet
        visible={lessonDescriptionSheetOpen && Boolean(currentLesson?.description)}
        title={t("coursePlayer.description.title")}
        onClose={() => setLessonDescriptionSheetOpen(false)}
        minHeight={420}
        initialHeightRatio={0.72}
      >
        <ScrollView
          style={styles.lessonDescriptionSheetScroll}
          contentContainerStyle={styles.lessonDescriptionSheetContent}
          showsVerticalScrollIndicator={false}
        >
         
          <Text style={styles.lessonDescriptionSheetBody}>
            {currentLesson?.description || ""}
          </Text>
        </ScrollView>
      </DraggableBottomSheet>

      <DraggableBottomSheet
        visible={playerSettingsOpen && canRenderLessonPlayer}
        title="Player sozlamalari"
        onClose={() => setPlayerSettingsOpen(false)}
        minHeight={420}
        initialHeightRatio={0.62}
      >
        <ScrollView
          style={styles.playerSettingsSheetScroll}
          contentContainerStyle={styles.playerSettingsSheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.playerSettingsSection}>
            <Text style={styles.playerSettingsLabel}>Playback tezligi</Text>
            <View style={styles.playerRateGrid}>
              {VIDEO_PLAYBACK_RATES.map((rate) => {
                const active = rate === videoPlaybackRate;
                return (
                  <Pressable
                    key={`rate-${rate}`}
                    style={[
                      styles.playerRateChip,
                      active && styles.playerRateChipActive,
                    ]}
                    onPress={() => handleSelectPlaybackRate(rate)}
                  >
                    <Text
                      style={[
                        styles.playerRateChipText,
                        active && styles.playerRateChipTextActive,
                      ]}
                    >
                      {rate}x
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {lessonMediaItems.length > 1 ? (
            <View style={styles.playerSettingsSection}>
              <Text style={styles.playerSettingsLabel}>Playlist</Text>
              {lessonMediaItems.map((item, index) => {
                const active = index === activeMediaIndex;
                return (
                  <Pressable
                    key={`media-${item.mediaId || index}`}
                    style={[
                      styles.playerSegmentRow,
                      active && styles.playerSegmentRowActive,
                    ]}
                    onPress={() => handleSelectMediaItem(index)}
                  >
                    <View style={styles.playerSegmentIndex}>
                      <Text style={styles.playerSegmentIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.playerSegmentBody}>
                      <Text style={styles.playerSegmentTitle} numberOfLines={1}>
                        {item.title || `${index + 1}-video`}
                      </Text>
                      <Text style={styles.playerSegmentMeta}>
                        {formatPlaybackClock(item.durationSeconds || 0)}
                      </Text>
                    </View>
                    {active ? (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      </DraggableBottomSheet>

      {renderOwnerLessonAdminModal()}

      <CommentsModal
        visible={commentsOpen}
        course={currentCourse}
        lesson={currentLesson}
        onClose={() => setCommentsOpen(false)}
      />
      <LessonEditorModal
        visible={lessonEditorOpen}
        courseId={currentCourse?._id || null}
        lesson={editingLesson}
        onClose={() => {
          setLessonEditorOpen(false);
          setEditingLesson(null);
        }}
        onSaved={invalidateCourseDetail}
        pickDocument={pickDocument}
        formatFileSize={formatFileSize}
        styles={styles}
      />
      <MaterialEditorModal
        visible={materialModalOpen}
        courseId={currentCourse?._id || null}
        lessonId={currentLesson?._id || null}
        onClose={() => setMaterialModalOpen(false)}
        onSaved={invalidateCourseDetail}
      />
      <LinkedTestModal
        visible={linkedTestModalOpen}
        courseId={currentCourse?._id || null}
        lessonId={currentLesson?._id || null}
        onClose={() => setLinkedTestModalOpen(false)}
        onSaved={invalidateCourseDetail}
      />
      <HomeworkEditorModal
        visible={homeworkModalOpen}
        courseId={currentCourse?._id || null}
        lessonId={currentLesson?._id || null}
        onClose={() => setHomeworkModalOpen(false)}
        onSaved={invalidateCourseDetail}
        pickDocument={pickDocument}
        formatFileSize={formatFileSize}
        styles={styles}
      />
      <HomeworkSubmitModal
        visible={homeworkSubmitOpen}
        courseId={currentCourse?._id || null}
        lessonId={currentLesson?._id || null}
        assignment={selectedHomework}
        onClose={() => {
          setHomeworkSubmitOpen(false);
          setSelectedHomework(null);
        }}
        onSaved={invalidateCourseDetail}
        pickDocument={pickDocument}
        styles={styles}
      />
      <InlineTestPlayerModal
        visible={Boolean(activeArenaTest && activeLinkedTest)}
        test={activeArenaTest}
        linkedTest={activeLinkedTest}
        loading={arenaLoading}
        onClose={handleCloseArenaPlayer}
        onSubmit={handleSubmitArenaTest}
        styles={styles}
      />
      <InlineSentenceBuilderModal
        visible={Boolean(activeSentenceDeck && activeLinkedTest)}
        deck={activeSentenceDeck}
        linkedTest={activeLinkedTest}
        loading={arenaLoading}
        onClose={handleCloseArenaPlayer}
        onSubmit={async (payload) => handleSubmitArenaTest(payload)}
        styles={styles}
      />
    </>
  ) : null;

  if (detailOnly) {
    return detailLayer ?? (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.loaderState}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.screenStack}>
        {mainContent}
      </View>

      <CreateCourseModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (payload) => {
          try {
            await createMutation.mutateAsync(payload);
            setCreateOpen(false);
          } catch (error) {
            Alert.alert(
              "Kurs yaratilmadi",
              error instanceof Error ? error.message : "Noma'lum xatolik",
            );
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create<Record<string, any>>({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,  
  },
  deadlineFieldRowWrapper:{
    display:'flex',
    flexDirection:'column'
  },
  screenStack: {
    flex: 1,
  },
  flexTarget: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  detailOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  detailSafeArea: {
    backgrround: Colors.surface,
    flex: 1,
  },
  coursesTopHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  sidebarActionButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  coursesTabsRow: {
    position: "relative",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  coursesTabsTrack: {
    ...StyleSheet.absoluteFillObject,
    justifyContent:'space-around',
    minHeight:50,
  },
  coursesTabIndicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  coursesTab: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  coursesTabText: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "500",
  },
  coursesTabTextActive: {
    color: Colors.text,
    fontWeight: "700",
  },
  topBar: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  screenTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  addCourseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tabSwitcher: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  switchTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  switchTabActive: {
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  switchTabText: {
    color: Colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  switchTabTextActive: {
    color: Colors.primary,
  },
  searchWrap: {
    flex: 1,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
  listScroll: {
    flex: 1,
  },
  listPagerTrack: {
    flex: 1,
  },
  listPage: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    padding: 0,
    paddingTop: 4,
    paddingBottom: 120,
  },
  loaderState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    color: Colors.mutedText,
    textAlign: "center",
    lineHeight: 20,
  },
  sidebarCourseItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "relative",
    backgroundColor: "transparent",
    overflow: "visible",
    minHeight: 72,
  },
  sidebarCourseItemActive: {
    backgroundColor: Colors.active,
  },
  sidebarCourseItemPressed: {
    backgroundColor: Colors.hover,
  },
  sidebarCourseAccent: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: Colors.primary,
  },
  sidebarCourseAccentHidden: {
    opacity: 0,
  },
  courseItem: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 12,
  },
  courseThumb: {
    width: 60,
    height: 60,
    borderRadius: 14,
    overflow: "hidden",
  },
  sidebarCourseThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: Colors.surfaceElevated,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  courseThumbFallback: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarCourseThumbFallback: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  courseThumbLetter: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  sidebarCourseBody: {
    flex: 1,
    minWidth: 0,
  },
  courseBody: {
    flex: 1,
    minWidth: 0,
  },
  courseItemTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  courseItemDescription: {
    color: Colors.mutedText,
    fontSize: 12,
    flexShrink: 1,
  },
  courseDescriptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sidebarCourseMeta: {
    minWidth: 32,
    alignItems: "flex-end",
    gap: 8,
  },
  sidebarCourseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  courseItemMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  courseMetaText: {
    color: Colors.mutedText,
    fontSize: 11,
  },
  courseStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: Colors.primarySoft,
  },
  courseStatusBadgeApproved: {
    backgroundColor: "rgba(67,181,129,0.16)",
  },
  courseStatusBadgePending: {
    backgroundColor: "rgba(250,166,26,0.16)",
  },
  courseStatusBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: "600",
  },
  courseStatusBadgeTextApproved: {
    color: Colors.accent,
  },
  courseStatusBadgeTextPending: {
    color: Colors.warning,
  },
  sidebarCourseAction: {
    width: 20,
    height: 20,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarCourseActionPressed: {
    backgroundColor: "rgba(240, 71, 71, 0.1)",
  },
  arenaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "transparent",
    minHeight: 72,
  },
  arenaThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#32343a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  arenaBody: {
    flex: 1,
    minWidth: 0,
  },
  arenaItemTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  arenaItemDescription: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  arenaPanelCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  arenaPanelHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  arenaPanelCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  arenaPanelEyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  arenaPanelTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  arenaPanelDescription: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  arenaMetaPill: {
    minHeight: 30,
    minWidth: 56,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: "rgba(88,101,242,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  arenaMetaPillText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  arenaPanelEmpty: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
  },
  arenaUnavailableCard: {
    padding: 16,
    gap: 12,
  },
  arenaRowHint: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  detailContainer: {
    flex: 1,
    position: "relative",
    backgroundColor: Colors.background,
  },
  detailSwipeEdge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 24,
    zIndex: 10,
  },
  detailHeader: {
    minHeight: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  detailHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    padding: 0,
    paddingBottom: 28,
    gap: 0,
  },
  playerStageCard: {
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  videoStage: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#111317",
    position: "relative",
  },
  videoStageFallback: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#17191d",
    position: "relative",
  },
  videoStageTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  videoStageBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoStageTopTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  videoStageTitleWrap: {
    flex: 1,
    gap: 2,
  },
  videoStageSubtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "500",
  },
  videoStageTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
  videoStageTopChip: {
    minWidth: 48,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoStageTopChipText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  videoStageTopActionAnchor: {
    position: "relative",
  },
  videoStageTopActionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  videoStageTopActionButtonReady: {
    backgroundColor: Colors.accent,
  },
  videoStageTooltip: {
    position: "absolute",
    right: 0,
    top: 42,
    minWidth: 156,
    maxWidth: 220,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    zIndex: 3,
    elevation: 10,
  },
  videoStageTooltipText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    textAlign: "center",
  },
  videoStageCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  videoView: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#111317",
  },
  videoStageOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    zIndex: 3,
    elevation: 6,
  },
  videoStageTouchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  videoStageTopGradient: {
    paddingTop: 0,
  },
  videoStageCenterControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingHorizontal: 24,
  },
  videoStageSeekButton: {
    width: 38,
    height: 38,
    borderRadius: 29,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  videoStageSeekLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  videoStagePlayButton: {
    width: 54,
    height: 54,
    borderRadius: 37,
    backgroundColor: "#00000071",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoStagePlayIcon: {
    marginLeft: 3,
  },
  videoStageBottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 10,
  },
  videoStageMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  videoStageMetaBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  videoStageMetaBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  videoStageProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    position: "relative",
  },
  videoStageProgressBuffered: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  videoStageProgressElapsed: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  videoStageProgressThumb: {
    position: "absolute",
    top: "50%",
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    marginTop: -7,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  videoStageProgressMarker: {
    position: "absolute",
    top: 1,
    bottom: 1,
    width: 1,
    marginLeft: -0.5,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  videoStageControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },
  videoStageControlButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoStageControlButtonWide: {
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  videoStageControlButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  videoStageTimeText: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "left",
  },
  videoStageMiniProgressWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  videoStageMiniProgress: {
    height: "100%",
    backgroundColor: Colors.primary,
  },
  playerSettingsSheetScroll: {
    flex: 1,
  },
  playerSettingsSheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 18,
  },
  playerSettingsSection: {
    gap: 12,
  },
  playerSettingsLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  playerRateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  playerRateChip: {
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  playerRateChipActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  playerRateChipText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  playerRateChipTextActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
  playerSegmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playerSegmentRowActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  playerSegmentIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  playerSegmentIndexText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  playerSegmentBody: {
    flex: 1,
    gap: 2,
  },
  playerSegmentTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  playerSegmentMeta: {
    color: Colors.mutedText,
    fontSize: 11,
    fontWeight: "500",
  },
  videoInfoCard: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  videoInfoTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 25,
  },
  videoMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
  },
  videoMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  videoMetaItemLiked: {
    backgroundColor: "transparent",
  },
  videoMetaText: {
    color: Colors.mutedText,
    fontSize: 13,
    fontWeight: "500",
  },
  videoMetaTextLiked: {
    color: Colors.danger,
  },
  offlineLessonCard: {
    marginTop: 4,
    gap: 10,
  },
  offlineLessonButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  offlineLessonButtonReady: {
    backgroundColor: Colors.accent,
  },
  offlineLessonButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  offlineLessonHint: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  lessonDescriptionCard: {
    display: "flex",
    flexDirection: "row",
  },
  lessonDescriptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  lessonDescriptionTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  lessonDescriptionBody: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 21,
  },
  lessonDescriptionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft:8,
  },
  lessonDescriptionFooterText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  lessonMaterialsSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  lessonMaterialsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  lessonMaterialsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lessonMaterialsTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  lessonMaterialsCount: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "700",
  },
  lessonMaterialsHint: {
    color: Colors.subtleText,
    fontSize: 13,
    lineHeight: 19,
  },
  lessonDescriptionSheetScroll: {
    flex: 1,
  },
  lessonDescriptionSheetContent: {
    padding: 18,
    paddingBottom: 32,
    gap: 16,
  },
  lessonDescriptionSheetLessonTitle: {
    color: Colors.text,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
  },
  lessonDescriptionSheetMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  lessonDescriptionSheetMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lessonDescriptionSheetMetaText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },
  lessonDescriptionSheetBody: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 25,
  },
  adminPaneSafeArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    flex: 1,
    minHeight: 0,
  },
  adminPaneKeyboardAvoid: {
    flex: 1,
    minHeight: 0,
  },
  adminPaneOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
  },
  adminPaneBackdropFade: {
    ...StyleSheet.absoluteFillObject,
  },
  adminPaneBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 15, 28, 0.62)",
  },
  adminPaneShell: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Colors.background,
  },
  adminPaneTopBar: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  adminPaneTitleWrap: {
    flex: 1,
    gap: 4,
  },
  adminPaneTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  adminPaneMuted: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  adminPaneCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  adminPaneActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  adminPaneGhostButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adminPaneGhostButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  adminPanePrimaryButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adminPanePrimaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  adminPaneDangerButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.28)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adminPaneDangerButtonText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  adminPaneScroll: {
    flex: 1,
  },
  adminPaneScrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  adminPaneLessonStrip: {
    gap: 10,
    paddingBottom: 2,
  },
  adminPaneLessonButton: {
    width: 208,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  adminPaneLessonButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  adminPaneLessonTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  adminPaneLessonTitleActive: {
    color: Colors.primary,
  },
  adminPaneLessonMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  adminPaneLessonMetaText: {
    color: Colors.subtleText,
    fontSize: 11,
    fontWeight: "600",
  },
  adminPaneSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  adminPaneSummaryCard: {
    flexGrow: 1,
    minWidth: "47%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 6,
  },
  adminPaneSummaryLabel: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "600",
  },
  adminPaneSummaryValue: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  adminPaneTabs: {
    gap: 8,
    paddingBottom: 2,
  },
  adminPaneTabButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  adminPaneTabButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  adminPaneTabText: {
    color: Colors.subtleText,
    fontSize: 13,
    fontWeight: "700",
  },
  adminPaneTabTextActive: {
    color: Colors.primary,
  },
  adminPaneStack: {
    gap: 14,
  },
  adminPaneSectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  adminPaneSectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  adminPaneSectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  adminPaneSectionMuted: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "600",
  },
  adminPaneInlineAction: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  adminPaneInlineActionMuted: {
    backgroundColor: Colors.input,
  },
  adminPaneInlineActionDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  adminPaneInlineActionText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  adminPaneInlineActionTextMuted: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  adminPaneInlineActionTextDanger: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  adminPaneEmptyText: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    color: Colors.subtleText,
    fontSize: 13,
    lineHeight: 20,
  },
  adminPaneResourceActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adminPaneCenterState: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  adminPaneList: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  adminPaneMemberRow: {
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adminPaneMemberMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  adminPaneMemberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  adminPaneMemberAvatarImage: {
    width: "100%",
    height: "100%",
  },
  adminPaneMemberAvatarLetter: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: "800",
  },
  adminPaneMemberCopy: {
    flex: 1,
    gap: 2,
  },
  adminPaneMemberName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  adminPaneMemberSub: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  adminPaneAttendanceActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  adminPaneStatusChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  adminPaneStatusChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  adminPaneStatusChipText: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "700",
  },
  adminPaneStatusChipTextActive: {
    color: Colors.primary,
  },
  adminPaneStudentCard: {
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adminPaneMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  adminPaneOralEditor: {
    gap: 10,
  },
  adminPaneInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.text,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  adminPaneTextarea: {
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  adminPaneOralSummary: {
    gap: 4,
  },
  adminPaneOralSummaryTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  adminPaneOralSummaryValue: {
    color: Colors.primary,
    fontWeight: "800",
  },
  adminPaneStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(67, 181, 129, 0.14)",
  },
  adminPaneStatusPillDraft: {
    backgroundColor: "rgba(250, 166, 26, 0.14)",
  },
  adminPaneStatusPillText: {
    color: Colors.accent,
    fontSize: 10,
    fontWeight: "800",
  },
  adminPaneStatusPillTextDraft: {
    color: Colors.warning,
  },
  lessonAdminSheetScroll: {
    flex: 1,
  },
  lessonAdminSheetScrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  lessonAdminSheetContent: {
    gap: 14,
  },
  lessonAdminHeaderCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 12,
  },
  studentExtrasCard: {
    borderBottomWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  studentExtrasHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  studentExtrasHeaderCopy: {
    gap: 4,
  },
  studentExtrasTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  studentExtrasTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  studentExtrasHint: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  studentExtrasBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  studentExtrasBadge: {
    borderWidth: 1,
    borderColor: "rgba(67,181,129,0.24)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(67,181,129,0.1)",
  },
  studentExtrasBadgeText: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  studentExtrasBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  studentExtraBlock: {
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },
  studentExtraHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  studentExtraTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  studentExtraHint: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  compactEnrollmentCard: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 12,
  },
  enrollmentInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  creatorAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  creatorAvatarImage: {
    width: "100%",
    height: "100%",
  },
  creatorAvatarLetter: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  creatorMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  creatorName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  creatorCount: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  enrollmentActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  roundedActionButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  roundedActionButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  roundedActionButtonAdmin: {
    backgroundColor: "rgba(88,101,242,0.15)",
  },
  roundedActionButtonPending: {
    backgroundColor: "rgba(250,166,26,0.12)",
    borderWidth: 1,
    borderColor: "rgba(250,166,26,0.28)",
  },
  roundedActionButtonSuccess: {
    backgroundColor: "rgba(67,181,129,0.12)",
    borderWidth: 1,
    borderColor: "rgba(67,181,129,0.28)",
  },
  roundedActionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  roundedActionButtonTextAdmin: {
    color: Colors.primary,
  },
  roundedActionButtonTextPending: {
    color: Colors.warning,
  },
  roundedActionButtonTextSuccess: {
    color: Colors.accent,
  },
  playerShellCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playerHeroCard: {
    padding: 16,
    gap: 14,
  },
  courseHero: {
    width: "100%",
    aspectRatio: 1.8,
    borderRadius: 22,
  },
  courseHeroFallback: {
    width: "100%",
    aspectRatio: 1.8,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  courseHeroLetter: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "800",
  },
  courseName: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 32,
  },
  courseDescription: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 22,
  },
  heroBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroBadgeAccent: {
    backgroundColor: Colors.primarySoft,
    borderColor: "rgba(88,101,242,0.32)",
  },
  heroBadgeText: {
    color: Colors.subtleText,
    fontSize: 11,
    fontWeight: "700",
  },
  heroBadgeTextAccent: {
    color: Colors.primary,
  },
  playerLessonCard: {
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  playerLessonHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  playerLessonHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  playerLessonEyebrow: {
    color: Colors.subtleText,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  playerLessonTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  playerLessonDescription: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
  playerLessonActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  courseStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  courseStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  courseStatText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  lessonTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(250,166,26,0.14)",
  },
  lessonTagText: {
    color: Colors.warning,
    fontSize: 10,
    fontWeight: "700",
  },
  enrollCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 10,
  },
  enrollTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  enrollText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.5,
  },
  lessonsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  playlistPanel: {
    backgroundColor: Colors.surface,
    overflow: "hidden",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  playlistHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  playlistHeaderMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  playlistTitleText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  playlistTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playlistBackButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },
  playlistCount: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "500",
    backgroundColor: Colors.input,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  playlistHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  lessonRow: {
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  lessonRowActive: {
    backgroundColor: Colors.primarySoft,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  lessonRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lessonIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  lessonIndexActive: {
    backgroundColor: Colors.primary,
  },
  lessonIndexText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  lessonIndexTextActive: {
    color: "#fff",
  },
  lessonCopy: {
    flex: 1,
    minWidth: 0,
  },
  lessonTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lessonTitle: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "500",
  },
  lessonTitleActive: {
    color: Colors.text,
    fontWeight: "600",
  },
  lessonMeta: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  lessonMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  lessonMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  lessonMetaDot: {
    color: Colors.subtleText,
    fontSize: 11,
    lineHeight: 12,
  },
  lessonMiniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(250,166,26,0.14)",
  },
  lessonMiniBadgeFree: {
    backgroundColor: "rgba(67,181,129,0.16)",
  },
  lessonMiniBadgeText: {
    color: Colors.warning,
    fontSize: 10,
    fontWeight: "700",
  },
  lessonMiniBadgeTextFree: {
    color: Colors.accent,
  },
  lessonDetailCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 12,
  },
  lessonDescription: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 22,
  },
  lessonActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  mediaButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mediaButtonLocked: {
    backgroundColor: "rgba(250,166,26,0.12)",
    borderWidth: 1,
    borderColor: "rgba(250,166,26,0.35)",
  },
  mediaButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  mediaButtonTextLocked: {
    color: Colors.warning,
  },
  metaButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  metaButtonText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  lessonExtrasRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  extraPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.input,
  },
  extraPillText: {
    color: Colors.text,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(8,15,28,0.62)",
    justifyContent: "flex-end",
  },
  modalKeyboardAvoid: {
    flex: 1,
  },
  commentsModal: {
    height: "78%",
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  commentsHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commentsTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.hover,
    alignItems: "center",
    justifyContent: "center",
  },
  commentsScroll: {
    flex: 1,
  },
  commentsContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  commentsEmpty: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  commentBlock: {
    gap: 8,
  },
  commentBubble: {
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
  },
  commentAuthor: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  commentTime: {
    color: Colors.mutedText,
    fontSize: 11,
  },
  commentText: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  replyAction: {
    alignSelf: "flex-start",
  },
  replyActionText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  replyList: {
    marginLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: Colors.border,
    paddingLeft: 10,
    gap: 8,
  },
  replyBubble: {
    borderRadius: 14,
    backgroundColor: Colors.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  loadMoreButton: {
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  commentComposerWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    backgroundColor: Colors.surface,
    gap: 10,
  },
  replyingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.hover,
  },
  replyingText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },
  commentComposerRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  commentInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    paddingHorizontal: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  createModal: {
    width: "100%",
    maxHeight: "86%",
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  createHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  createTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  createContent: {
    padding: 16,
    gap: 12,
  },
  fieldInput: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  textArea: {
    minHeight: 100,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  accessRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  accessChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.input,
  },
  accessChipActive: {
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  accessChipText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  accessChipTextActive: {
    color: Colors.primary,
  },
  homeworkEditorScroll: {
    flex: 1,
  },
  homeworkEditorBody: {
    flex: 1,
    position: "relative",
  },
  homeworkEditorContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  homeworkEditorIntro: {
    gap: 4,
  },
  homeworkEditorIntroTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  homeworkEditorIntroText: {
    color: Colors.subtleText,
    fontSize: 13,
    lineHeight: 19,
  },
  homeworkEditorField: {
    gap: 8,
    width: "100%",
  },
  homeworkEditorLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  homeworkEditorRow: {
    gap: 12,
    alignItems: "flex-start",
  },
  homeworkEditorHalfField: {
    flex: 1,
  },
  homeworkTypeList: {
    gap: 10,
  },
  homeworkTypeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
  },
  homeworkTypeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  homeworkTypeIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(43, 160, 156, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  homeworkTypeIconWrapActive: {
    backgroundColor: Colors.primary,
  },
  homeworkTypeCopy: {
    flex: 1,
    gap: 2,
  },
  homeworkTypeTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  homeworkTypeTitleActive: {
    color: Colors.primary,
  },
  homeworkTypeHint: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 17,
  },
  homeworkTypeHintActive: {
    color: Colors.text,
  },
  homeworkUploadHintCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 10,
  },
  homeworkUploadHintHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  homeworkUploadHintIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  homeworkUploadHintCopy: {
    flex: 1,
    gap: 2,
  },
  homeworkUploadHintTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  homeworkUploadHintText: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  homeworkUploadHintMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 2,
  },
  homeworkUploadHintMetaLabel: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  homeworkUploadHintMetaValue: {
    flex: 1,
    textAlign: "right",
    color: Colors.text,
    fontSize: 12,
  },
  deadlineFieldButton: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  deadlineFieldLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deadlineFieldIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  deadlineFieldCopy: {
    flex: 1,
    gap: 2,
  },
  deadlineFieldLabel: {
    color: Colors.mutedText,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  deadlineFieldValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  deadlineFieldValuePlaceholder: {
    color: Colors.subtleText,
    fontWeight: "500",
  },
  deadlineClearButton: {
    alignSelf: "flex-end",
    paddingTop: 4,
  },
  deadlineClearButtonText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  deadlinePickerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  homeworkPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  homeworkPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
  },
  deadlinePickerModalCard: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    borderRadius: 24,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  deadlinePickerModalBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },
  deadlinePickerModalLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  deadlinePickerActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  deadlinePickerGhostButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  deadlinePickerGhostText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  deadlinePickerPrimaryButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  deadlinePickerPrimaryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  homeworkEditorFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  mediaPicker: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaPickerText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  fileInfoCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  fileInfoTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  fileInfoMeta: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  secondaryAccentButton: {
    minWidth: 92,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryAccentButtonText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  smallModal: {
    width: "100%",
    maxHeight: "72%",
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  inlineToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
  },
  checkboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  inlineToggleText: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
  },
  coverPreview: {
    width: "100%",
    aspectRatio: 1.8,
    borderRadius: 18,
  },
  sectionHint: {
    color: Colors.subtleText,
    fontSize: 13,
    lineHeight: 20,
  },
  ownerBanner: {
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: 14,
    gap: 6,
  },
  ownerBannerTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  ownerBannerText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  inlineSectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.input,
  },
  inlineSectionActionText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  lessonRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowIconButton: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  lockNotice: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(255, 184, 77, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 184, 77, 0.28)",
  },
  lockNoticeText: {
    flex: 1,
    color: Colors.warning,
    fontSize: 13,
    lineHeight: 18,
  },
  extrasCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  extrasHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  extrasHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  extrasHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  extrasTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  materialsList: {
    // paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  materialCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  materialMeta: {
    flex: 1,
    gap: 3,
  },
  materialName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  materialSub: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  materialActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  materialIconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceList: {
    paddingBottom: 14,
    gap: 10,
  },
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.input,
  },
  resourceCopy: {
    flex: 1,
    gap: 3,
  },
  resourceTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  resourceMeta: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  resourceButton: {
    minWidth: 72,
    height: 34,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  progressBadgeText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  homeworkCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.input,
    gap: 10,
  },
  homeworkDescription: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  gradingGrid: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  gradeStat: {
    width: "31%",
    minWidth: 94,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.input,
    gap: 4,
  },
  gradeStatValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  gradeStatLabel: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  runnerSafeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  runnerHeader: {
    minHeight: 56,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  runnerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  runnerMetaPill: {
    minWidth: 58,
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  runnerMetaPillText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  runnerCenterState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  runnerBody: {
    flex: 1,
    padding: 16,
    gap: 14,
  },
  runnerProgressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.input,
    overflow: "hidden",
  },
  runnerProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  runnerQuestionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 14,
  },
  runnerQuestionCounter: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "700",
  },
  runnerQuestionText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
  },
  runnerOptionsList: {
    gap: 10,
  },
  runnerOptionButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  runnerOptionButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  runnerOptionLabel: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
    color: Colors.text,
    backgroundColor: Colors.input,
    fontSize: 12,
    fontWeight: "700",
    paddingTop: 6,
  },
  runnerOptionText: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  runnerOptionTextActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
  runnerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  runnerResultContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  runnerSummaryCard: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    gap: 6,
  },
  runnerSummaryValue: {
    color: Colors.primary,
    fontSize: 40,
    fontWeight: "800",
  },
  runnerSummaryLabel: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  runnerSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  runnerSummaryStat: {
    flexGrow: 1,
    minWidth: 96,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  runnerSummaryStatValue: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  runnerSummaryStatLabel: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  runnerBreakdownList: {
    gap: 12,
  },
  runnerBreakdownCard: {
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  runnerBreakdownQuestion: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  runnerOptionReview: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  runnerOptionReviewCorrect: {
    borderColor: "#22c55e",
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  runnerOptionReviewSelected: {
    borderColor: Colors.danger,
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  runnerOptionReviewText: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  builderDropZone: {
    minHeight: 72,
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
  builderPoolWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  builderToken: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  builderTokenSelected: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  builderTokenExpected: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#22c55e",
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  builderTokenText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  builderFeedback: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 12,
    gap: 10,
  },
  createFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
});
