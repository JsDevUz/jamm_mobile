import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  ArrowLeft,
  Brain,
  BookOpen,
  CheckCircle2,
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
  Lock,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Send,
  Shield,
  Swords,
  Trash2,
  Type as TypeIcon,
  Upload,
  Users,
  X,
} from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { PersistentCachedImage } from "../../components/PersistentCachedImage";
import { TextInput } from "../../components/TextInput";
import { arenaApi, coursesApi } from "../../lib/api";
import type { MainTabScreenProps } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type {
  Course,
  CourseComment,
  CourseHomeworkAssignment,
  CourseLinkedTest,
  CourseLessonGradingResponse,
  CourseLessonMaterial,
  CourseLesson,
  CourseMember,
} from "../../types/courses";
import { getEntityId } from "../../utils/chat";

type Props = MainTabScreenProps<"Courses">;
type CourseViewMode = "courses" | "arena";
type LessonMediaMode = "upload" | "url";

type ArenaItem = {
  key: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
  gradient: string;
};

type ArenaTestQuestion = {
  question?: string;
  prompt?: string;
  options?: string[];
};

type ArenaTestPayload = {
  _id?: string;
  title?: string;
  questions?: ArenaTestQuestion[];
  displayMode?: "single" | "list" | string;
  timeLimit?: number;
  showResults?: boolean;
};

type SentenceBuilderQuestion = {
  prompt?: string;
  poolTokens?: string[];
};

type SentenceBuilderDeck = {
  _id?: string;
  title?: string;
  items?: SentenceBuilderQuestion[];
};

const ARENA_ITEMS: ArenaItem[] = [
  {
    key: "tests",
    title: "Testlar",
    description: "Arena quiz mashqlari va tezkor sinovlar.",
    icon: BookOpen,
    gradient: "linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)",
  },
  {
    key: "flashcards",
    title: "Flashcards",
    description: "Kartochkalar bilan yodlash va takrorlash.",
    icon: Layers,
    gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  },
  {
    key: "sentenceBuilders",
    title: "Sentence Builder",
    description: "Gap tuzish mashqlari va grammatik drillar.",
    icon: TypeIcon,
    gradient: "linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)",
  },
  {
    key: "mnemonics",
    title: "Mnemonics",
    description: "Eslab qolish uchun mnemonic mashqlar.",
    icon: Brain,
    gradient: "linear-gradient(135deg, #64748b 0%, #334155 100%)",
  },
  {
    key: "battles",
    title: "Battles",
    description: "Bilimlar bellashuvi va duel rejimi.",
    icon: Swords,
    gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  },
];

const COURSE_CATEGORIES = ["IT", "Design", "Language", "Business", "Science"];

function timeAgo(value?: string | null) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hozir";
  if (mins < 60) return `${mins}d`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}s`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}k`;
  return new Date(value).toLocaleDateString("uz-UZ", {
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

function formatAccessType(value?: string | null) {
  if (value === "free_open") return "Open";
  if (value === "paid") return "Paid";
  return "Request";
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
      title="Dars izohlari"
      onClose={onClose}
      minHeight={520}
      initialHeightRatio={0.8}
      footer={
        <View style={styles.commentComposerWrap}>
          {replyingTo ? (
            <View style={styles.replyingBar}>
              <Text style={styles.replyingText}>Reply mode</Text>
              <Pressable onPress={() => setReplyingTo(null)}>
                <X size={14} color={Colors.mutedText} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.commentComposerRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Izoh yozing..."
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
                <Text style={styles.emptyText}>Hali izoh yo'q</Text>
              </View>
            ) : (
              comments.map((comment) => (
                <View key={comment._id} style={styles.commentBlock}>
                  <View style={styles.commentBubble}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>{comment.userName || "User"}</Text>
                      <Text style={styles.commentTime}>{timeAgo(comment.createdAt)}</Text>
                    </View>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>
                  <Pressable
                    style={styles.replyAction}
                    onPress={() => setReplyingTo(comment._id || null)}
                  >
                    <Text style={styles.replyActionText}>Javob yozish</Text>
                  </Pressable>

                  {comment.replies?.length ? (
                    <View style={styles.replyList}>
                      {comment.replies.map((reply) => (
                        <View key={reply._id} style={styles.replyBubble}>
                          <View style={styles.commentHeader}>
                            <Text style={styles.commentAuthor}>{reply.userName || "User"}</Text>
                            <Text style={styles.commentTime}>{timeAgo(reply.createdAt)}</Text>
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
                  {loading ? "Yuklanmoqda..." : "Ko'proq izohlar"}
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
        "Rasm yuklanmadi",
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
            <Text style={styles.createTitle}>Yangi kurs</Text>
            <Pressable style={styles.iconCircle} onPress={onClose}>
              <X size={18} color={Colors.mutedText} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.createContent} showsVerticalScrollIndicator={false}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Kurs nomi"
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Qisqacha tavsif"
              placeholderTextColor={Colors.subtleText}
              style={[styles.fieldInput, styles.textArea]}
              multiline
            />
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="Kategoriya"
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="Narx"
              placeholderTextColor={Colors.subtleText}
              keyboardType="number-pad"
              style={styles.fieldInput}
            />

            <View style={styles.accessRow}>
              {[
                { id: "free_request", label: "Request" },
                { id: "free_open", label: "Open" },
                { id: "paid", label: "Paid" },
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
                {uploading ? "Yuklanmoqda..." : image ? "Cover tayyor" : "Cover tanlash"}
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
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (!name.trim() || saving) && styles.sendButtonDisabled]}
              disabled={!name.trim() || saving}
              onPress={() => void handleSubmit()}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Yaratish</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LessonEditorModal({
  visible,
  courseId,
  lesson,
  onClose,
  onSaved,
}: {
  visible: boolean;
  courseId: string | null;
  lesson?: CourseLesson | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<LessonMediaMode>("upload");
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    size: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTitle("");
      setDescription("");
      setMode("upload");
      setVideoUrl("");
      setSelectedFile(null);
      setSaving(false);
      setUploading(false);
      return;
    }

    setTitle(lesson?.title || "");
    setDescription(lesson?.description || "");
    if (lesson?.videoUrl && !lesson?.fileUrl) {
      setMode("url");
      setVideoUrl(lesson.videoUrl);
      setSelectedFile(null);
    } else if (lesson?.fileUrl || lesson?.mediaItems?.[0]?.fileUrl) {
      const media = lesson.mediaItems?.[0];
      setMode("upload");
      setVideoUrl("");
      setSelectedFile({
        uri: media?.fileUrl || lesson.fileUrl || "",
        name: media?.fileName || lesson.fileName || lesson.title || "video",
        size: Number(media?.fileSize || lesson.fileSize || 0),
      });
    } else {
      setMode("upload");
      setVideoUrl("");
      setSelectedFile(null);
    }
  }, [lesson, visible]);

  const handlePickVideo = async () => {
    const file = await pickDocument("video/*");
    if (!file?.uri) return;
    setSelectedFile({
      uri: file.uri,
      name: file.name || "lesson-video",
      size: Number(file.size || 0),
    });
  };

  const handleSave = async (publish = false) => {
    if (!courseId || !title.trim() || saving) return;
    if (publish && mode === "upload" && !selectedFile?.uri) return;
    if (publish && mode === "url" && !videoUrl.trim()) return;

    setSaving(true);
    try {
      let payload: Parameters<typeof coursesApi.addLesson>[1] = {
        title: title.trim(),
        description: description.trim(),
        type: mode === "url" ? "video" : "file",
        status: publish ? "published" : "draft",
      };

      if (mode === "url") {
        payload.videoUrl = videoUrl.trim();
      } else if (selectedFile?.uri) {
        setUploading(true);
        const uploaded = await coursesApi.uploadMedia(selectedFile.uri);
        payload = {
          ...payload,
          fileUrl: uploaded.fileUrl || uploaded.url || "",
          videoUrl: uploaded.streamType === "hls" ? uploaded.url || "" : "",
          fileName: uploaded.fileName || selectedFile.name,
          fileSize: Number(uploaded.fileSize || selectedFile.size || 0),
          durationSeconds: Number(uploaded.durationSeconds || 0),
          streamType: uploaded.streamType || "direct",
          mediaItems: [
            {
              title: title.trim(),
              videoUrl: uploaded.streamType === "hls" ? uploaded.url || "" : "",
              fileUrl: uploaded.fileUrl || uploaded.url || "",
              fileName: uploaded.fileName || selectedFile.name,
              fileSize: Number(uploaded.fileSize || selectedFile.size || 0),
              durationSeconds: Number(uploaded.durationSeconds || 0),
              streamType: uploaded.streamType || "direct",
              hlsKeyAsset: uploaded.hlsKeyAsset || "",
            },
          ],
          hlsKeyAsset: uploaded.hlsKeyAsset || "",
        };
      }

      if (lesson?._id || lesson?.urlSlug) {
        const lessonId = lesson._id || lesson.urlSlug || "";
        await coursesApi.updateLesson(courseId, lessonId, payload);
        if (publish && lesson.status === "draft") {
          await coursesApi.publishLesson(courseId, lessonId);
        }
      } else {
        await coursesApi.addLesson(courseId, payload);
      }

      await onSaved();
      onClose();
    } catch (error) {
      Alert.alert("Dars saqlanmadi", error instanceof Error ? error.message : "Noma'lum xatolik");
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.createModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.createHeader}>
            <Text style={styles.createTitle}>
              {lesson ? "Darsni tahrirlash" : "Yangi dars"}
            </Text>
            <Pressable style={styles.iconCircle} onPress={onClose}>
              <X size={18} color={Colors.mutedText} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.createContent} showsVerticalScrollIndicator={false}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Dars sarlavhasi"
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Dars tavsifi"
              placeholderTextColor={Colors.subtleText}
              style={[styles.fieldInput, styles.textArea]}
              multiline
            />

            <View style={styles.accessRow}>
              {[
                { id: "upload", label: "Fayl" },
                { id: "url", label: "URL" },
              ].map((option) => (
                <Pressable
                  key={option.id}
                  style={[styles.accessChip, mode === option.id && styles.accessChipActive]}
                  onPress={() => setMode(option.id as LessonMediaMode)}
                >
                  <Text
                    style={[
                      styles.accessChipText,
                      mode === option.id && styles.accessChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {mode === "url" ? (
              <TextInput
                value={videoUrl}
                onChangeText={setVideoUrl}
                placeholder="https://..."
                placeholderTextColor={Colors.subtleText}
                style={styles.fieldInput}
              />
            ) : (
              <Pressable style={styles.mediaPicker} onPress={() => void handlePickVideo()}>
                <Upload size={16} color={Colors.primary} />
                <Text style={styles.mediaPickerText}>
                  {selectedFile ? selectedFile.name : "Video tanlash"}
                </Text>
              </Pressable>
            )}

            {selectedFile ? (
              <View style={styles.fileInfoCard}>
                <Text style={styles.fileInfoTitle}>{selectedFile.name}</Text>
                <Text style={styles.fileInfoMeta}>{formatFileSize(selectedFile.size)}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.createFooter}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryAccentButton, (!title.trim() || saving) && styles.sendButtonDisabled]}
              disabled={!title.trim() || saving}
              onPress={() => void handleSave(false)}
            >
              <Text style={styles.secondaryAccentButtonText}>
                {saving && !uploading ? "Saqlanmoqda..." : "Draft"}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.primaryButton,
                (!title.trim() || saving || uploading) && styles.sendButtonDisabled,
              ]}
              disabled={!title.trim() || saving || uploading}
              onPress={() => void handleSave(true)}
            >
              {saving || uploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Publish</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MaterialEditorModal({
  visible,
  courseId,
  lessonId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  courseId: string | null;
  lessonId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<{ uri: string; name: string; size: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTitle("");
      setFile(null);
      setSaving(false);
    }
  }, [visible]);

  const pickPdf = async () => {
    const selected = await pickDocument("application/pdf");
    if (!selected?.uri) return;
    setFile({
      uri: selected.uri,
      name: selected.name || "material.pdf",
      size: Number(selected.size || 0),
    });
  };

  const handleSave = async () => {
    if (!courseId || !lessonId || !title.trim() || !file?.uri || saving) return;
    setSaving(true);
    try {
      const uploaded = await coursesApi.uploadMedia(file.uri);
      await coursesApi.upsertLessonMaterial(courseId, lessonId, {
        title: title.trim(),
        fileUrl: uploaded.fileUrl || uploaded.url || "",
        fileName: uploaded.fileName || file.name,
        fileSize: Number(uploaded.fileSize || file.size || 0),
      });
      await onSaved();
      onClose();
    } catch (error) {
      Alert.alert("Material saqlanmadi", error instanceof Error ? error.message : "Noma'lum xatolik");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.smallModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.createHeader}>
            <Text style={styles.createTitle}>Material qo'shish</Text>
            <Pressable style={styles.iconCircle} onPress={onClose}>
              <X size={18} color={Colors.mutedText} />
            </Pressable>
          </View>
          <View style={styles.createContent}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Material nomi"
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            <Pressable style={styles.mediaPicker} onPress={() => void pickPdf()}>
              <FileText size={16} color={Colors.primary} />
              <Text style={styles.mediaPickerText}>
                {file ? file.name : "PDF tanlash"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.createFooter}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (!title.trim() || !file || saving) && styles.sendButtonDisabled]}
              disabled={!title.trim() || !file || saving}
              onPress={() => void handleSave()}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Saqlash</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LinkedTestModal({
  visible,
  courseId,
  lessonId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  courseId: string | null;
  lessonId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [url, setUrl] = useState("");
  const [minimumScore, setMinimumScore] = useState("60");
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setUrl("");
      setMinimumScore("60");
      setRequired(true);
      setSaving(false);
    }
  }, [visible]);

  const handleSave = async () => {
    if (!courseId || !lessonId || !url.trim() || saving) return;
    setSaving(true);
    try {
      await coursesApi.upsertLessonLinkedTest(courseId, lessonId, {
        url: url.trim(),
        minimumScore: Number(minimumScore || 60),
        requiredToUnlock: required,
      });
      await onSaved();
      onClose();
    } catch (error) {
      Alert.alert("Test ulanmagan", error instanceof Error ? error.message : "Noma'lum xatolik");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.smallModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.createHeader}>
            <Text style={styles.createTitle}>Arena mashqi qo'shish</Text>
            <Pressable style={styles.iconCircle} onPress={onClose}>
              <X size={18} color={Colors.mutedText} />
            </Pressable>
          </View>
          <View style={styles.createContent}>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="Arena test yoki sentence-builder URL"
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            <TextInput
              value={minimumScore}
              onChangeText={setMinimumScore}
              placeholder="Minimum score"
              placeholderTextColor={Colors.subtleText}
              keyboardType="number-pad"
              style={styles.fieldInput}
            />
            <Pressable style={styles.inlineToggle} onPress={() => setRequired((value) => !value)}>
              <View style={[styles.checkbox, required && styles.checkboxActive]} />
              <Text style={styles.inlineToggleText}>Keyingi darsni ochish uchun majburiy</Text>
            </Pressable>
          </View>
          <View style={styles.createFooter}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (!url.trim() || saving) && styles.sendButtonDisabled]}
              disabled={!url.trim() || saving}
              onPress={() => void handleSave()}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Saqlash</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HomeworkEditorModal({
  visible,
  courseId,
  lessonId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  courseId: string | null;
  lessonId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [type, setType] = useState<"text" | "audio" | "video" | "pdf" | "photo">("text");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTitle("");
      setDescription("");
      setDeadline("");
      setMaxScore("100");
      setType("text");
      setSaving(false);
    }
  }, [visible]);

  const handleSave = async () => {
    if (!courseId || !lessonId || !title.trim() || saving) return;
    setSaving(true);
    try {
      await coursesApi.upsertLessonHomework(courseId, lessonId, {
        enabled: true,
        title: title.trim(),
        description: description.trim(),
        type,
        deadline: deadline.trim() || undefined,
        maxScore: Number(maxScore || 100),
      });
      await onSaved();
      onClose();
    } catch (error) {
      Alert.alert("Homework saqlanmadi", error instanceof Error ? error.message : "Noma'lum xatolik");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.createModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.createHeader}>
            <Text style={styles.createTitle}>Homework qo'shish</Text>
            <Pressable style={styles.iconCircle} onPress={onClose}>
              <X size={18} color={Colors.mutedText} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.createContent} showsVerticalScrollIndicator={false}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Topshiriq sarlavhasi"
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Tavsif"
              placeholderTextColor={Colors.subtleText}
              style={[styles.fieldInput, styles.textArea]}
              multiline
            />
            <TextInput
              value={deadline}
              onChangeText={setDeadline}
              placeholder="Deadline (2026-03-30)"
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            <TextInput
              value={maxScore}
              onChangeText={setMaxScore}
              placeholder="Max score"
              placeholderTextColor={Colors.subtleText}
              keyboardType="number-pad"
              style={styles.fieldInput}
            />
            <View style={styles.accessRow}>
              {(["text", "audio", "video", "pdf", "photo"] as const).map((option) => (
                <Pressable
                  key={option}
                  style={[styles.accessChip, type === option && styles.accessChipActive]}
                  onPress={() => setType(option)}
                >
                  <Text
                    style={[
                      styles.accessChipText,
                      type === option && styles.accessChipTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <View style={styles.createFooter}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (!title.trim() || saving) && styles.sendButtonDisabled]}
              disabled={!title.trim() || saving}
              onPress={() => void handleSave()}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Saqlash</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HomeworkSubmitModal({
  visible,
  courseId,
  lessonId,
  assignment,
  onClose,
  onSaved,
}: {
  visible: boolean;
  courseId: string | null;
  lessonId: string | null;
  assignment: CourseHomeworkAssignment | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<{ uri: string; name: string; size: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setText("");
      setLink("");
      setFile(null);
      setSaving(false);
      return;
    }

    setText(assignment?.selfSubmission?.text || "");
    setLink(assignment?.selfSubmission?.link || "");
    if (assignment?.selfSubmission?.fileUrl) {
      setFile({
        uri: assignment.selfSubmission.fileUrl,
        name: assignment.selfSubmission.fileName || "submission",
        size: Number(assignment.selfSubmission.fileSize || 0),
      });
    } else {
      setFile(null);
    }
  }, [assignment, visible]);

  const pickSubmissionFile = async () => {
    const mime =
      assignment?.type === "pdf"
        ? "application/pdf"
        : assignment?.type === "photo"
          ? "image/*"
          : assignment?.type === "audio"
            ? "audio/*"
            : assignment?.type === "video"
              ? "video/*"
              : "*/*";
    const selected = await pickDocument(mime);
    if (!selected?.uri) return;
    setFile({
      uri: selected.uri,
      name: selected.name || "submission",
      size: Number(selected.size || 0),
    });
  };

  const handleSubmit = async () => {
    if (!courseId || !lessonId || !assignment?.assignmentId || saving) return;
    setSaving(true);
    try {
      let payload: Parameters<typeof coursesApi.submitLessonHomework>[3] = {
        text: text.trim() || undefined,
        link: link.trim() || undefined,
      };

      if (file?.uri && !file.uri.startsWith("http")) {
        const uploaded = await coursesApi.uploadMedia(file.uri);
        payload = {
          ...payload,
          fileUrl: uploaded.fileUrl || uploaded.url || "",
          fileName: uploaded.fileName || file.name,
          fileSize: Number(uploaded.fileSize || file.size || 0),
          streamType: uploaded.streamType || "direct",
          hlsKeyAsset: uploaded.hlsKeyAsset || "",
        };
      }

      await coursesApi.submitLessonHomework(courseId, lessonId, assignment.assignmentId, payload);
      await onSaved();
      onClose();
    } catch (error) {
      Alert.alert("Topshiriq yuborilmadi", error instanceof Error ? error.message : "Noma'lum xatolik");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.createModal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.createHeader}>
            <Text style={styles.createTitle}>{assignment?.title || "Homework topshirish"}</Text>
            <Pressable style={styles.iconCircle} onPress={onClose}>
              <X size={18} color={Colors.mutedText} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.createContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionHint}>{assignment?.description || "Topshiriqni yuboring."}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Matnli javob"
              placeholderTextColor={Colors.subtleText}
              style={[styles.fieldInput, styles.textArea]}
              multiline
            />
            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder="Havola"
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
            {assignment?.type !== "text" ? (
              <Pressable style={styles.mediaPicker} onPress={() => void pickSubmissionFile()}>
                <Upload size={16} color={Colors.primary} />
                <Text style={styles.mediaPickerText}>
                  {file ? file.name : "Fayl tanlash"}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <View style={styles.createFooter}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, saving && styles.sendButtonDisabled]}
              disabled={saving}
              onPress={() => void handleSubmit()}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Yuborish</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function InlineTestPlayerModal({
  visible,
  test,
  linkedTest,
  loading,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  test: ArenaTestPayload | null;
  linkedTest: CourseLinkedTest | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: { answers: number[] }) => Promise<Record<string, unknown> | null>;
}) {
  const questions = useMemo(() => test?.questions || [], [test?.questions]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [singleAnswers, setSingleAnswers] = useState<number[]>([]);
  const [listAnswers, setListAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const displayMode = test?.displayMode === "list" ? "list" : "single";
  const currentQuestion = questions[currentIdx];

  useEffect(() => {
    if (!visible) {
      setCurrentIdx(0);
      setSingleAnswers([]);
      setListAnswers({});
      setSubmitting(false);
      setResult(null);
      setTimeLeft(0);
      return;
    }

    setCurrentIdx(0);
    setSingleAnswers([]);
    setListAnswers({});
    setSubmitting(false);
    setResult(null);
    setTimeLeft(Math.max(0, Number(test?.timeLimit || linkedTest?.timeLimit || 0) * 60));
  }, [linkedTest?.timeLimit, test?.timeLimit, visible]);

  useEffect(() => {
    if (!visible || !timeLeft || result || submitting) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [result, submitting, timeLeft, visible]);

  useEffect(() => {
    if (!visible || timeLeft !== 0 || result || submitting) {
      return;
    }

    const answers = questions.map((_, index) =>
      displayMode === "list" ? listAnswers[index] ?? -1 : singleAnswers[index] ?? -1,
    );
    void (async () => {
      setSubmitting(true);
      try {
        setResult(await onSubmit({ answers }));
      } finally {
        setSubmitting(false);
      }
    })();
  }, [displayMode, listAnswers, onSubmit, questions, result, singleAnswers, submitting, timeLeft, visible]);

  const selectOption = (questionIndex: number, optionIndex: number) => {
    if (displayMode === "list") {
      setListAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }));
      return;
    }

    setSingleAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
  };

  const handleNext = async () => {
    if (displayMode !== "single") return;
    if (singleAnswers[currentIdx] === undefined) return;
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      return;
    }

    setSubmitting(true);
    try {
      setResult(await onSubmit({ answers: questions.map((_, index) => singleAnswers[index] ?? -1) }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleListSubmit = async () => {
    setSubmitting(true);
    try {
      setResult(await onSubmit({ answers: questions.map((_, index) => listAnswers[index] ?? -1) }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.runnerSafeArea} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.runnerHeader}>
          <Pressable style={styles.headerButton} onPress={onClose}>
            <ArrowLeft size={18} color={Colors.text} />
          </Pressable>
          <Text style={styles.runnerTitle} numberOfLines={1}>
            {linkedTest?.title || test?.title || "Maydon testi"}
          </Text>
          <View style={styles.runnerMetaPill}>
            <Text style={styles.runnerMetaPillText}>
              {timeLeft > 0
                ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`
                : `${questions.length} savol`}
            </Text>
          </View>
        </View>

        {loading && !test ? (
          <View style={styles.runnerCenterState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : result ? (
          <ScrollView contentContainerStyle={styles.runnerResultContent} showsVerticalScrollIndicator={false}>
            <View style={styles.runnerSummaryCard}>
              <Text style={styles.runnerSummaryValue}>{Number(result.score || 0)}</Text>
              <Text style={styles.runnerSummaryLabel}>To'g'ri javob</Text>
            </View>
            <View style={styles.runnerSummaryGrid}>
              <View style={styles.runnerSummaryStat}>
                <Text style={styles.runnerSummaryStatValue}>{Number(result.percent || 0)}%</Text>
                <Text style={styles.runnerSummaryStatLabel}>Aniqlik</Text>
              </View>
              <View style={styles.runnerSummaryStat}>
                <Text style={styles.runnerSummaryStatValue}>{Number(result.minimumScore || 0)}%</Text>
                <Text style={styles.runnerSummaryStatLabel}>Minimum</Text>
              </View>
              <View style={styles.runnerSummaryStat}>
                <Text style={styles.runnerSummaryStatValue}>
                  {result.passed ? "Passed" : "Retry"}
                </Text>
                <Text style={styles.runnerSummaryStatLabel}>Holat</Text>
              </View>
            </View>
            {Array.isArray(result.results) && result.showResults !== false ? (
              <View style={styles.runnerBreakdownList}>
                {result.results.map((item, index) => {
                  const resultItem = item as {
                    questionIndex?: number;
                    correct?: boolean;
                    correctOptionIndex?: number;
                  };
                  const question =
                    questions[resultItem.questionIndex ?? index] || questions[index];
                  const selectedIndex =
                    displayMode === "list"
                      ? listAnswers[resultItem.questionIndex ?? index]
                      : singleAnswers[resultItem.questionIndex ?? index];

                  return (
                    <View key={`result-${index}`} style={styles.runnerBreakdownCard}>
                      <Text style={styles.runnerBreakdownQuestion}>
                        {question?.question || question?.prompt || `${index + 1}-savol`}
                      </Text>
                      {(question?.options || []).map((option, optionIndex) => {
                        const isCorrect = resultItem.correctOptionIndex === optionIndex;
                        const isSelected = selectedIndex === optionIndex;

                        return (
                          <View
                            key={`${option}-${optionIndex}`}
                            style={[
                              styles.runnerOptionReview,
                              isCorrect && styles.runnerOptionReviewCorrect,
                              isSelected && !isCorrect && styles.runnerOptionReviewSelected,
                            ]}
                          >
                            <Text style={styles.runnerOptionReviewText}>{option}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        ) : displayMode === "list" ? (
          <ScrollView contentContainerStyle={styles.runnerBody} showsVerticalScrollIndicator={false}>
            {questions.map((question, questionIndex) => (
              <View key={`question-${questionIndex}`} style={styles.runnerQuestionCard}>
                <Text style={styles.runnerQuestionText}>
                  {question.question || question.prompt || `${questionIndex + 1}-savol`}
                </Text>
                <View style={styles.runnerOptionsList}>
                  {(question.options || []).map((option, optionIndex) => (
                    <Pressable
                      key={`${option}-${optionIndex}`}
                      style={[
                        styles.runnerOptionButton,
                        listAnswers[questionIndex] === optionIndex && styles.runnerOptionButtonActive,
                      ]}
                      onPress={() => selectOption(questionIndex, optionIndex)}
                    >
                      <Text style={styles.runnerOptionLabel}>{String.fromCharCode(65 + optionIndex)}</Text>
                      <Text
                        style={[
                          styles.runnerOptionText,
                          listAnswers[questionIndex] === optionIndex && styles.runnerOptionTextActive,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.runnerBody}>
            <View style={styles.runnerProgressBar}>
              <View
                style={[
                  styles.runnerProgressFill,
                  { width: `${questions.length ? ((currentIdx + 1) / questions.length) * 100 : 0}%` },
                ]}
              />
            </View>
            <View style={styles.runnerQuestionCard}>
              <Text style={styles.runnerQuestionCounter}>
                {currentIdx + 1} / {questions.length}
              </Text>
              <Text style={styles.runnerQuestionText}>
                {currentQuestion?.question || currentQuestion?.prompt || "Savol"}
              </Text>
              <View style={styles.runnerOptionsList}>
                {(currentQuestion?.options || []).map((option, optionIndex) => (
                  <Pressable
                    key={`${option}-${optionIndex}`}
                    style={[
                      styles.runnerOptionButton,
                      singleAnswers[currentIdx] === optionIndex && styles.runnerOptionButtonActive,
                    ]}
                    onPress={() => selectOption(currentIdx, optionIndex)}
                  >
                    <Text style={styles.runnerOptionLabel}>{String.fromCharCode(65 + optionIndex)}</Text>
                    <Text
                      style={[
                        styles.runnerOptionText,
                        singleAnswers[currentIdx] === optionIndex && styles.runnerOptionTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {!result ? (
          <View style={styles.runnerFooter}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, submitting && styles.sendButtonDisabled]}
              disabled={
                submitting ||
                (displayMode === "single"
                  ? singleAnswers[currentIdx] === undefined
                  : questions.some((_, index) => listAnswers[index] === undefined))
              }
              onPress={() => void (displayMode === "single" ? handleNext() : handleListSubmit())}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {displayMode === "single" && currentIdx < questions.length - 1
                    ? "Keyingi"
                    : "Yakunlash"}
                </Text>
              )}
            </Pressable>
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

function InlineSentenceBuilderModal({
  visible,
  deck,
  linkedTest,
  loading,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  deck: SentenceBuilderDeck | null;
  linkedTest: CourseLinkedTest | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    sentenceBuilderAnswers: Array<{ questionIndex: number; selectedTokens: string[] }>;
  }) => Promise<Record<string, unknown> | null>;
}) {
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
  }, [answerMap, currentQuestion, questionIndex, summary]);

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

export function CoursesScreen({ navigation }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(user);
  const [viewMode, setViewMode] = useState<CourseViewMode>("courses");
  const pagerRef = useRef<ScrollView>(null);
  const pagerScrollX = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(0);
  const [tabsWidth, setTabsWidth] = useState(0);
  const [activeArenaTab, setActiveArenaTab] = useState("tests");
  const [query, setQuery] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
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
  const [activeLinkedTest, setActiveLinkedTest] = useState<CourseLinkedTest | null>(null);
  const [activeArenaTest, setActiveArenaTest] = useState<ArenaTestPayload | null>(null);
  const [activeSentenceDeck, setActiveSentenceDeck] = useState<SentenceBuilderDeck | null>(null);
  const [arenaLoading, setArenaLoading] = useState(false);

  const coursesQuery = useQuery({
    queryKey: ["courses"],
    queryFn: () => coursesApi.fetchCourses(1, 40),
  });

  const selectedCourseQuery = useQuery({
    queryKey: ["course", selectedCourseId],
    queryFn: () => coursesApi.getCourse(selectedCourseId || ""),
    enabled: Boolean(selectedCourseId),
  });

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
      setSelectedCourseId(course.urlSlug || course._id || null);
      setSelectedLessonId(course.lessons?.[0]?._id || null);
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
        (course) =>
          String(course.createdBy || "") === currentUserId ||
          course.members?.some(
            (member: CourseMember) =>
              String(member.userId || "") === currentUserId && member.status === "approved",
          ),
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

  const currentCourse = selectedCourseQuery.data || null;
  const currentLesson =
    currentCourse?.lessons?.find(
      (lesson) =>
        String(lesson._id || "") === String(selectedLessonId || "") ||
        String(lesson.urlSlug || "") === String(selectedLessonId || ""),
    ) ||
    currentCourse?.lessons?.[0] ||
    null;
  const lessonKey =
    currentCourse?._id && currentLesson?._id ? [currentCourse._id, currentLesson._id] : null;

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

  const gradingQuery = useQuery({
    queryKey: ["course-grading", ...(lessonKey || [])],
    queryFn: () => coursesApi.getLessonGrading(currentCourse?._id || "", currentLesson?._id || ""),
    enabled: Boolean(currentCourse?._id && currentLesson?._id && gradingExpanded),
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
    if (currentCourse?.lessons?.length && !selectedLessonId) {
      setSelectedLessonId(currentCourse.lessons[0]._id || currentCourse.lessons[0].urlSlug || null);
    }
  }, [currentCourse?.lessons, selectedLessonId]);

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

  const isOwner = Boolean(currentCourse && String(currentCourse.createdBy || "") === currentUserId);
  const myMemberRecord = currentCourse?.members?.find(
    (member) => String(member.userId || "") === currentUserId,
  );
  const isApprovedMember = myMemberRecord?.status === "approved";
  const isPendingMember = myMemberRecord?.status === "pending";
  const canAccessCurrentLesson = Boolean(isOwner || currentLesson?.isUnlocked);
  const lessonMaterials = materialsQuery.data?.items || currentLesson?.materials || [];
  const linkedTests = testsQuery.data?.items || currentLesson?.linkedTests || [];
  const homeworkAssignments =
    homeworkQuery.data?.assignments || currentLesson?.homework?.assignments || [];
  const grading = gradingQuery.data as CourseLessonGradingResponse | undefined;

  const handleOpenCourse = async (course: Course) => {
    await Haptics.selectionAsync();
    const identifier = course.urlSlug || course._id || null;
    setSelectedCourseId(identifier);
    setSelectedLessonId(course.lessons?.[0]?._id || course.lessons?.[0]?.urlSlug || null);
    setPlaylistCollapsed(false);
  };

  const handleSelectLesson = async (lesson: CourseLesson) => {
    setSelectedLessonId(lesson._id || lesson.urlSlug || null);
    if (currentCourse?._id && lesson._id) {
      void coursesApi.incrementViews(currentCourse._id, lesson._id).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["course", selectedCourseId] });
      });
    }
  };

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
    Alert.alert("Kurs havolasi", `/courses/${slug}`);
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
        setActiveSentenceDeck((payload.deck || payload) as SentenceBuilderDeck);
        setActiveArenaTest(null);
        return;
      }

      const testId = String(linkedTest.testId || linkedTest.resourceId || "");
      if (!testId) {
        if (linkedTest.url) {
          await Linking.openURL(linkedTest.url).catch(() => {
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
        "Maydon ochilmadi",
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

  const handleSubmitLinkedTest = async (payload: {
    answers?: number[];
    sentenceBuilderAnswers?: Array<{ questionIndex: number; selectedTokens: string[] }>;
  }) => {
    if (!currentCourse?._id || !currentLesson?._id || !activeLinkedTest?.linkedTestId) {
      return null;
    }

    const result = await coursesApi.submitLessonLinkedTestAttempt(
      currentCourse._id,
      currentLesson._id,
      activeLinkedTest.linkedTestId,
      payload,
    );
    await invalidateCourseDetail();
    return result;
  };

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
          <Text style={styles.emptyTitle}>Kurs topilmadi</Text>
          <Text style={styles.emptyText}>
            {query.trim()
              ? "Qidiruvni o'zgartiring yoki yangi kurs yarating."
              : "Qo'shilgan yoki yaratilgan kurslar shu yerda ko'rinadi."}
          </Text>
        </View>
      );
    }

    return filteredCourses.map((course) => {
      const memberStatus =
        String(course.createdBy || "") === currentUserId
          ? "admin"
          : course.members?.find((member) => String(member.userId || "") === currentUserId)
              ?.status || null;
      return (
        <Pressable
          key={course._id || course.urlSlug}
          style={styles.sidebarCourseItem}
          onPress={() => void handleOpenCourse(course)}
        >
          {course.image ? (
            <PersistentCachedImage
              remoteUri={course.image}
              style={styles.sidebarCourseThumb}
              requireManualDownload
            />
          ) : (
            <View style={styles.sidebarCourseThumbFallback}>
              <Text style={styles.courseThumbLetter}>
                {(course.name || "?").charAt(0)}
              </Text>
            </View>
          )}

          <View style={styles.sidebarCourseBody}>
            <Text style={styles.courseItemTitle} numberOfLines={1}>
              {course.name}
            </Text>
            <Text style={styles.courseItemDescription} numberOfLines={1}>
              {course.description || "Kurs tavsifi kiritilmagan."}
            </Text>
          </View>

          <View style={styles.sidebarCourseMeta}>
            <View style={styles.sidebarCourseMetaRow}>
              <Users size={12} color={Colors.subtleText} />
              <Text style={styles.courseMetaText}>
                {course.membersCount || course.totalMembersCount || 0}
              </Text>
            </View>
            <Text style={styles.courseMetaText}>{course.lessonCount || 0} dars</Text>
            {memberStatus ? (
              <View style={styles.courseStatusBadge}>
                <Text style={styles.courseStatusBadgeText}>
                  {memberStatus === "approved"
                    ? "Approved"
                    : memberStatus === "pending"
                      ? "Pending"
                      : "Admin"}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    });
  };

  const renderArenaPage = () =>
    coursesQuery.isLoading ? (
      <View style={styles.loaderState}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    ) : (
      ARENA_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Pressable
            key={item.key}
            style={[
              styles.arenaItem,
              activeArenaTab === item.key && styles.arenaItemActive,
            ]}
            onPress={() => setActiveArenaTab(item.key)}
          >
            <View
              style={[
                styles.arenaThumb,
                {
                  backgroundColor: item.gradient.includes("#FF6B6B")
                    ? "#ff7b6b"
                    : item.gradient.includes("#4facfe")
                      ? "#1f92ff"
                      : item.gradient.includes("#22c55e")
                        ? "#1fa67a"
                        : item.gradient.includes("#64748b")
                          ? "#475569"
                          : "#9f7aea",
                },
              ]}
            >
              <Icon size={20} color="#fff" />
            </View>
            <View style={styles.arenaBody}>
              <Text style={styles.courseItemTitle}>{item.title}</Text>
              <Text style={styles.courseItemDescription} numberOfLines={2}>
                {item.description}
              </Text>
            </View>
          </Pressable>
        );
      })
    );

  if (selectedCourseId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <Pressable style={styles.headerButton} onPress={() => setSelectedCourseId(null)}>
              <ArrowLeft size={18} color={Colors.text} />
            </Pressable>
            <Text style={styles.detailTitle} numberOfLines={1}>
              {currentCourse?.name || "Course"}
            </Text>
            <View style={styles.detailHeaderActions}>
              <Pressable style={styles.headerButton} onPress={() => void handleCopyCourseLink()}>
                <Copy size={16} color={Colors.text} />
              </Pressable>
              {isOwner ? (
                <Pressable
                  style={styles.headerButton}
                  onPress={() => {
                    setEditingLesson(null);
                    setLessonEditorOpen(true);
                  }}
                >
                  <Plus size={16} color={Colors.text} />
                </Pressable>
              ) : null}
            </View>
          </View>

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
              {currentCourse.image ? (
                <PersistentCachedImage
                  remoteUri={currentCourse.image}
                  style={styles.courseHero}
                  requireManualDownload
                />
              ) : (
                <View style={styles.courseHeroFallback}>
                  <Text style={styles.courseHeroLetter}>
                    {(currentCourse.name || "?").charAt(0)}
                  </Text>
                </View>
              )}

              <View style={styles.playerHeroCard}>
                <Text style={styles.courseName}>{currentCourse.name}</Text>
                <Text style={styles.courseDescription}>
                  {currentCourse.description || "Kurs uchun tavsif hozircha kiritilmagan."}
                </Text>
                {currentLesson ? (
                  <View style={styles.playerLessonCard}>
                    <Text style={styles.playerLessonEyebrow}>Joriy dars</Text>
                    <Text style={styles.playerLessonTitle}>{currentLesson.title}</Text>
                    <Text style={styles.playerLessonDescription} numberOfLines={3}>
                      {currentLesson.description || "Bu dars uchun tavsif yo'q."}
                    </Text>
                    <View style={styles.playerLessonActions}>
                      <Pressable
                        style={[
                          styles.mediaButton,
                          !canAccessCurrentLesson && styles.mediaButtonLocked,
                        ]}
                        onPress={() => void handleOpenMedia()}
                      >
                        <Play size={16} color={canAccessCurrentLesson ? "#fff" : Colors.warning} />
                        <Text
                          style={[
                            styles.mediaButtonText,
                            !canAccessCurrentLesson && styles.mediaButtonTextLocked,
                          ]}
                        >
                          {canAccessCurrentLesson ? "Media ochish" : "Dars qulflangan"}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.metaButton}
                        onPress={() =>
                          currentCourse._id && currentLesson._id
                            ? likeLessonMutation.mutate({
                                courseId: currentCourse._id,
                                lessonId: currentLesson._id,
                              })
                            : undefined
                        }
                      >
                        <Heart
                          size={15}
                          color={currentLesson.liked ? Colors.danger : Colors.text}
                          fill={currentLesson.liked ? Colors.danger : "transparent"}
                        />
                        <Text style={styles.metaButtonText}>{currentLesson.likes || 0}</Text>
                      </Pressable>

                      <Pressable style={styles.metaButton} onPress={() => setCommentsOpen(true)}>
                        <MessageCircle size={15} color={Colors.text} />
                        <Text style={styles.metaButtonText}>Izohlar</Text>
                      </Pressable>

                      <View style={styles.metaButton}>
                        <Eye size={15} color={Colors.text} />
                        <Text style={styles.metaButtonText}>{currentLesson.views || 0}</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={styles.courseStats}>
                <View style={styles.courseStat}>
                  <Users size={14} color={Colors.mutedText} />
                  <Text style={styles.courseStatText}>
                    {currentCourse.totalMembersCount || currentCourse.membersCount || 0}
                  </Text>
                </View>
                <View style={styles.courseStat}>
                  <BookOpen size={14} color={Colors.mutedText} />
                  <Text style={styles.courseStatText}>{currentCourse.lessonCount || 0}</Text>
                </View>
                <View style={styles.courseStat}>
                  {currentCourse.accessType === "free_open" ? (
                    <CheckCircle2 size={14} color={Colors.accent} />
                  ) : (
                    <Lock size={14} color={Colors.warning} />
                  )}
                  <Text style={styles.courseStatText}>{formatAccessType(currentCourse.accessType)}</Text>
                </View>
                {currentCourse.accessType === "paid" ? (
                  <View style={styles.courseStat}>
                    <Shield size={14} color={Colors.primary} />
                    <Text style={styles.courseStatText}>{currentCourse.price || 0}</Text>
                  </View>
                ) : null}
              </View>

              {isOwner ? (
                <View style={styles.ownerBanner}>
                  <Text style={styles.ownerBannerTitle}>Kurs boshqaruvi</Text>
                  <Text style={styles.ownerBannerText}>
                    Dars, material, maydon mashqlari va homework shu yerdan boshqariladi.
                  </Text>
                </View>
              ) : null}

              {!isOwner && !isApprovedMember ? (
                <View style={styles.enrollCard}>
                  <Text style={styles.enrollTitle}>
                    {isPendingMember ? "So'rov yuborilgan" : "Kursga qo'shilish"}
                  </Text>
                  <Text style={styles.enrollText}>
                    {isPendingMember
                      ? "Admin tasdiqlashini kuting."
                      : "Darslarning to'liq qismini ko'rish uchun kursga kiring."}
                  </Text>
                  {!isPendingMember ? (
                    <Pressable
                      style={[
                        styles.primaryButton,
                        enrollMutation.isPending && styles.disabledButton,
                      ]}
                      disabled={enrollMutation.isPending}
                      onPress={() =>
                        currentCourse._id
                          ? enrollMutation.mutate(currentCourse._id)
                          : undefined
                      }
                    >
                      {enrollMutation.isPending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Kursga kirish</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.lessonsCard}>
                <View style={styles.playlistHeader}>
                  <View style={styles.playlistHeaderMain}>
                    <Text style={styles.playlistTitleText}>Darslar</Text>
                    <Text style={styles.playlistCount}>
                      {(currentCourse.lessons || []).length} ta dars
                    </Text>
                  </View>
                  <View style={styles.playlistHeaderActions}>
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
                  ? currentCourse.lessons?.map((lesson, index) => {
                  const active =
                    String(lesson._id || lesson.urlSlug || "") ===
                    String(currentLesson?._id || currentLesson?.urlSlug || "");
                  return (
                    <Pressable
                      key={lesson._id || lesson.urlSlug || index}
                      style={[styles.lessonRow, active && styles.lessonRowActive]}
                      onPress={() => void handleSelectLesson(lesson)}
                    >
                      <View style={styles.lessonRowMain}>
                        <View style={styles.lessonIndex}>
                          <Text style={styles.lessonIndexText}>{index + 1}</Text>
                        </View>
                        <View style={styles.lessonCopy}>
                          <Text style={styles.lessonTitle} numberOfLines={1}>
                            {lesson.title}
                          </Text>
                          <Text style={styles.lessonMeta} numberOfLines={1}>
                            {lesson.isUnlocked || isOwner
                              ? `${lesson.status === "draft" ? "Draft" : "Published"} · ${lesson.views || 0} view · ${lesson.likes || 0} like`
                              : "Qulflangan dars"}
                          </Text>
                        </View>
                      </View>
                      {isOwner ? (
                        <View style={styles.lessonRowActions}>
                          <Pressable
                            style={styles.rowIconButton}
                            onPress={() => {
                              setEditingLesson(lesson);
                              setLessonEditorOpen(true);
                            }}
                          >
                            <Pencil size={14} color={Colors.primary} />
                          </Pressable>
                          {lesson.status === "draft" && lesson._id ? (
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
                                          error instanceof Error ? error.message : "Xatolik",
                                        ),
                                      )
                                  : undefined
                              }
                            >
                              <Upload size={14} color={Colors.accent} />
                            </Pressable>
                          ) : null}
                          <Pressable
                            style={styles.rowIconButton}
                            onPress={() => void handleDeleteLesson(lesson)}
                          >
                            <Trash2 size={14} color={Colors.danger} />
                          </Pressable>
                        </View>
                      ) : !lesson.isUnlocked && !isOwner ? (
                        <Lock size={14} color={Colors.warning} />
                      ) : (
                        <Play size={14} color={active ? Colors.primary : Colors.subtleText} />
                      )}
                    </Pressable>
                  );
                })
                  : null}
              </View>

              {currentLesson ? (
                <View style={styles.lessonDetailCard}>
                  <Text style={styles.sectionTitle}>{currentLesson.title}</Text>
                  <Text style={styles.lessonDescription}>
                    {currentLesson.description || "Bu dars uchun tavsif yo'q."}
                  </Text>

                  {Array.isArray(currentLesson.accessLockedByTests) &&
                  currentLesson.accessLockedByTests.length > 0 &&
                  !canAccessCurrentLesson ? (
                    <View style={styles.lockNotice}>
                      <Lock size={16} color={Colors.warning} />
                      <Text style={styles.lockNoticeText}>
                        Keyingi darsni ochish uchun avval maydon mashqlarini yakunlang.
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.lessonExtrasRow}>
                    <View style={styles.extraPill}>
                      <Text style={styles.extraPillText}>
                        Materiallar: {lessonMaterials.length || 0}
                      </Text>
                    </View>
                    <View style={styles.extraPill}>
                      <Text style={styles.extraPillText}>
                        Maydon: {linkedTests.length || 0}
                      </Text>
                    </View>
                    <View style={styles.extraPill}>
                      <Text style={styles.extraPillText}>
                        Homework: {homeworkAssignments.length || 0}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.extrasCard}>
                    <Pressable
                      style={styles.extrasHeader}
                      onPress={() => setMaterialsExpanded((value) => !value)}
                    >
                      <View style={styles.extrasHeaderLeft}>
                        <FolderOpen size={16} color={Colors.primary} />
                        <Text style={styles.extrasTitle}>Materiallar</Text>
                      </View>
                      <View style={styles.extrasHeaderRight}>
                        {isOwner ? (
                          <Pressable
                            style={styles.rowIconButton}
                            onPress={() => setMaterialModalOpen(true)}
                          >
                            <Plus size={14} color={Colors.primary} />
                          </Pressable>
                        ) : null}
                        {materialsExpanded ? (
                          <ChevronUp size={16} color={Colors.subtleText} />
                        ) : (
                          <ChevronDown size={16} color={Colors.subtleText} />
                        )}
                      </View>
                    </Pressable>
                    {materialsExpanded ? (
                      lessonMaterials.length ? (
                        <View style={styles.resourceList}>
                          {lessonMaterials.map((item) => (
                            <View key={item.materialId || item.fileUrl} style={styles.resourceRow}>
                              <View style={styles.resourceCopy}>
                                <Text style={styles.resourceTitle}>{item.title}</Text>
                                <Text style={styles.resourceMeta}>
                                  {item.fileName} · {formatFileSize(item.fileSize)}
                                </Text>
                              </View>
                              <Pressable
                                style={styles.resourceButton}
                                onPress={() =>
                                  item.fileUrl
                                    ? Linking.openURL(item.fileUrl).catch(() => undefined)
                                    : undefined
                                }
                              >
                                <Text style={styles.resourceButtonText}>Ochish</Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.sectionHint}>Materiallar hali qo'shilmagan.</Text>
                      )
                    ) : null}
                  </View>

                  <View style={styles.extrasCard}>
                    <Pressable
                      style={styles.extrasHeader}
                      onPress={() => setTestsExpanded((value) => !value)}
                    >
                      <View style={styles.extrasHeaderLeft}>
                        <ClipboardList size={16} color={Colors.primary} />
                        <Text style={styles.extrasTitle}>Maydon mashqlari</Text>
                      </View>
                      <View style={styles.extrasHeaderRight}>
                        {isOwner ? (
                          <Pressable
                            style={styles.rowIconButton}
                            onPress={() => setLinkedTestModalOpen(true)}
                          >
                            <Plus size={14} color={Colors.primary} />
                          </Pressable>
                        ) : null}
                        {testsExpanded ? (
                          <ChevronUp size={16} color={Colors.subtleText} />
                        ) : (
                          <ChevronDown size={16} color={Colors.subtleText} />
                        )}
                      </View>
                    </Pressable>
                    {testsExpanded ? (
                      linkedTests.length ? (
                        <View style={styles.resourceList}>
                          {linkedTests.map((item) => (
                            <View key={item.linkedTestId || item.url} style={styles.resourceRow}>
                              <View style={styles.resourceCopy}>
                                <Text style={styles.resourceTitle}>{item.title}</Text>
                                <Text style={styles.resourceMeta}>
                                  {item.resourceType === "sentenceBuilder" ? "Sentence builder" : "Quiz"} · min {item.minimumScore || 0}%
                                </Text>
                              {item.selfProgress ? (
                                <Text style={styles.progressBadgeText}>
                                  {item.selfProgress.bestPercent || item.selfProgress.percent || 0}% · {item.selfProgress.passed ? "Passed" : "Waiting"}
                                </Text>
                              ) : null}
                            </View>
                            <Pressable
                              style={styles.resourceButton}
                              onPress={() => void handleOpenLinkedTest(item)}
                            >
                              <Text style={styles.resourceButtonText}>Boshlash</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                      ) : (
                        <Text style={styles.sectionHint}>Maydon mashqlari hali ulanmagan.</Text>
                      )
                    ) : null}
                  </View>

                  <View style={styles.extrasCard}>
                    <Pressable
                      style={styles.extrasHeader}
                      onPress={() => setHomeworkExpanded((value) => !value)}
                    >
                      <View style={styles.extrasHeaderLeft}>
                        <FileText size={16} color={Colors.primary} />
                        <Text style={styles.extrasTitle}>Homework</Text>
                      </View>
                      <View style={styles.extrasHeaderRight}>
                        {isOwner ? (
                          <Pressable
                            style={styles.rowIconButton}
                            onPress={() => setHomeworkModalOpen(true)}
                          >
                            <Plus size={14} color={Colors.primary} />
                          </Pressable>
                        ) : null}
                        {homeworkExpanded ? (
                          <ChevronUp size={16} color={Colors.subtleText} />
                        ) : (
                          <ChevronDown size={16} color={Colors.subtleText} />
                        )}
                      </View>
                    </Pressable>
                    {homeworkExpanded ? (
                      homeworkAssignments.length ? (
                        <View style={styles.resourceList}>
                          {homeworkAssignments.map((item) => (
                            <View key={item.assignmentId || item.title} style={styles.homeworkCard}>
                              <View style={styles.resourceCopy}>
                                <Text style={styles.resourceTitle}>{item.title}</Text>
                                <Text style={styles.resourceMeta}>
                                  {item.type} · {item.maxScore || 0} ball
                                  {item.deadline ? ` · ${timeAgo(item.deadline)}` : ""}
                                </Text>
                                {item.description ? (
                                  <Text style={styles.homeworkDescription}>{item.description}</Text>
                                ) : null}
                                {item.selfSubmission ? (
                                  <Text style={styles.progressBadgeText}>
                                    {item.selfSubmission.status || "submitted"}
                                    {item.selfSubmission.score !== null &&
                                    item.selfSubmission.score !== undefined
                                      ? ` · ${item.selfSubmission.score} ball`
                                      : ""}
                                  </Text>
                                ) : null}
                              </View>
                              {isOwner ? (
                                <Text style={styles.resourceMeta}>{item.submissionCount || 0} topshiriq</Text>
                              ) : (
                                <Pressable
                                  style={styles.resourceButton}
                                  onPress={() => handleOpenHomeworkSubmit(item)}
                                >
                                  <Text style={styles.resourceButtonText}>
                                    {item.selfSubmission ? "Yangilash" : "Topshirish"}
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.sectionHint}>Homework hali qo'shilmagan.</Text>
                      )
                    ) : null}
                  </View>

                  <View style={styles.extrasCard}>
                    <Pressable
                      style={styles.extrasHeader}
                      onPress={() => setGradingExpanded((value) => !value)}
                    >
                      <View style={styles.extrasHeaderLeft}>
                        <Shield size={16} color={Colors.primary} />
                        <Text style={styles.extrasTitle}>Baholash</Text>
                      </View>
                      {gradingExpanded ? (
                        <ChevronUp size={16} color={Colors.subtleText} />
                      ) : (
                        <ChevronDown size={16} color={Colors.subtleText} />
                      )}
                    </Pressable>
                    {gradingExpanded ? (
                      gradingQuery.isLoading ? (
                        <ActivityIndicator color={Colors.primary} />
                      ) : grading?.lesson?.self || grading?.lesson?.summary ? (
                        <View style={styles.gradingGrid}>
                          {!isOwner && grading?.lesson?.self ? (
                            <>
                              <View style={styles.gradeStat}>
                                <Text style={styles.gradeStatValue}>{grading.lesson.self.lessonScore || 0}%</Text>
                                <Text style={styles.gradeStatLabel}>Lesson score</Text>
                              </View>
                              <View style={styles.gradeStat}>
                                <Text style={styles.gradeStatValue}>
                                  {grading.lesson.self.homeworkPercent ?? 0}%
                                </Text>
                                <Text style={styles.gradeStatLabel}>Homework</Text>
                              </View>
                              <View style={styles.gradeStat}>
                                <Text style={styles.gradeStatValue}>
                                  {grading.lesson.self.attendanceStatus || "absent"}
                                </Text>
                                <Text style={styles.gradeStatLabel}>Attendance</Text>
                              </View>
                            </>
                          ) : (
                            <>
                              <View style={styles.gradeStat}>
                                <Text style={styles.gradeStatValue}>
                                  {grading?.lesson?.summary?.averageScore || 0}%
                                </Text>
                                <Text style={styles.gradeStatLabel}>O'rtacha</Text>
                              </View>
                              <View style={styles.gradeStat}>
                                <Text style={styles.gradeStatValue}>
                                  {grading?.lesson?.summary?.completedHomeworkCount || 0}
                                </Text>
                                <Text style={styles.gradeStatLabel}>Homework</Text>
                              </View>
                              <View style={styles.gradeStat}>
                                <Text style={styles.gradeStatValue}>
                                  {grading?.lesson?.summary?.attendanceMarkedCount || 0}
                                </Text>
                                <Text style={styles.gradeStatLabel}>Attendance</Text>
                              </View>
                            </>
                          )}
                        </View>
                      ) : (
                        <Text style={styles.sectionHint}>Baholash ma'lumoti hozircha yo'q.</Text>
                      )
                    ) : null}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>

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
        />
        <InlineTestPlayerModal
          visible={Boolean(activeArenaTest && activeLinkedTest)}
          test={activeArenaTest}
          linkedTest={activeLinkedTest}
          loading={arenaLoading}
          onClose={handleCloseArenaPlayer}
          onSubmit={handleSubmitLinkedTest}
        />
        <InlineSentenceBuilderModal
          visible={Boolean(activeSentenceDeck && activeLinkedTest)}
          deck={activeSentenceDeck}
          linkedTest={activeLinkedTest}
          loading={arenaLoading}
          onClose={handleCloseArenaPlayer}
          onSubmit={async (payload) => handleSubmitLinkedTest(payload)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <View style={styles.coursesTopHeader}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color={Colors.subtleText} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={viewMode === "arena" ? "Maydon qidirish" : "Kurs qidirish"}
              placeholderTextColor={Colors.subtleText}
              style={styles.searchInput}
            />
          </View>
          {viewMode === "courses" ? (
            <Pressable style={styles.sidebarActionButton} onPress={() => setCreateOpen(true)}>
              <Plus size={18} color={Colors.text} />
            </Pressable>
          ) : null}
        </View>

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
              Kurslar
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
              Maydon
            </Text>
          </Pressable>
        </View>

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
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={coursesQuery.isRefetching}
                  onRefresh={() => coursesQuery.refetch()}
                  tintColor={Colors.primary}
                />
              }
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {renderCoursesListPage()}
            </ScrollView>
          </View>
          <View style={[styles.listPage, { width: screenWidth }]}>
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={coursesQuery.isRefetching}
                  onRefresh={() => coursesQuery.refetch()}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    minHeight: 44,
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
    padding: 14,
    paddingBottom: 120,
    gap: 12,
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
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  courseThumbLetter: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
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
    fontWeight: "700",
  },
  courseItemDescription: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  sidebarCourseMeta: {
    minWidth: 56,
    alignItems: "flex-end",
    gap: 6,
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
    color: Colors.subtleText,
    fontSize: 12,
  },
  courseStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.primarySoft,
  },
  courseStatusBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  arenaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  arenaItemActive: {
    backgroundColor: Colors.hover,
  },
  arenaThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  arenaBody: {
    flex: 1,
    minWidth: 0,
  },
  detailContainer: {
    flex: 1,
    backgroundColor: Colors.background,
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
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  playerHeroCard: {
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
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
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  courseDescription: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 22,
  },
  playerLessonCard: {
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
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
  playlistHeader: {
    minHeight: 56,
    paddingHorizontal: 14,
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
  playlistCount: {
    color: Colors.mutedText,
    fontSize: 12,
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
    minHeight: 58,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  lessonRowActive: {
    backgroundColor: Colors.primarySoft,
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
  lessonIndexText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  lessonCopy: {
    flex: 1,
    minWidth: 0,
  },
  lessonTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  lessonMeta: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 3,
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
  resourceList: {
    paddingHorizontal: 14,
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
