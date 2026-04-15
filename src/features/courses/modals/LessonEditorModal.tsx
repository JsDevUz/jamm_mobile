import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { DocumentPickerAsset } from "expo-document-picker";
import { CirclePlay, FileVideo, Link2, Sparkles, Upload } from "lucide-react-native";
import { DraggableBottomSheet } from "../../../components/DraggableBottomSheet";
import { TextInput } from "../../../components/TextInput";
import { useI18n } from "../../../i18n";
import { coursesApi } from "../../../lib/api";
import { Colors } from "../../../theme/colors";
import type { CourseLesson } from "../../../types/courses";

type LessonMediaMode = "upload" | "url";

type Props = {
  visible: boolean;
  courseId: string | null;
  lesson?: CourseLesson | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  pickDocument: (type?: string) => Promise<DocumentPickerAsset | null>;
  formatFileSize: (bytes?: number | null) => string;
  styles: any;
};

export function LessonEditorModal({
  visible,
  courseId,
  lesson,
  onClose,
  onSaved,
  pickDocument,
  formatFileSize,
  styles,
}: Props) {
  const { t } = useI18n();
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
  const isEditing = Boolean(lesson);

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
    <DraggableBottomSheet
      visible={visible}
      title={lesson ? t("addLesson.editTitle") : t("addLesson.title")}
      onClose={onClose}
      minHeight={620}
      initialHeightRatio={0.84}
      maxHeightRatio={0.96}
      footer={
        <View style={styles.createFooter}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryAccentButton, (!title.trim() || saving) && styles.sendButtonDisabled]}
            disabled={!title.trim() || saving}
            onPress={() => void handleSave(false)}
          >
            <Text style={styles.secondaryAccentButtonText}>
              {saving && !uploading ? t("common.saving") : t("addLesson.saveDraft")}
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
              <Text style={styles.primaryButtonText}>{t("addLesson.publish")}</Text>
            )}
          </Pressable>
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={styles.createContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={modalStyles.heroCard}>
          <View style={modalStyles.heroIconWrap}>
            <Sparkles size={18} color={Colors.primary} />
          </View>
          <View style={modalStyles.heroCopy}>
            <Text style={modalStyles.heroTitle}>
              {isEditing ? "Darsni yangilang" : "Yangi dars yarating"}
            </Text>
            <Text style={modalStyles.heroText}>
              Nom, tavsif va video manbasini kiriting. Draft saqlab keyinroq publish qilishingiz
              ham mumkin.
            </Text>
          </View>
        </View>

        <View style={modalStyles.fieldGroup}>
          <Text style={modalStyles.fieldLabel}>{t("addLesson.lessonName")}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("addLesson.lessonName")}
            placeholderTextColor={Colors.subtleText}
            style={styles.fieldInput}
          />
        </View>

        <View style={modalStyles.fieldGroup}>
          <Text style={modalStyles.fieldLabel}>{t("addLesson.description")}</Text>
          <Text style={modalStyles.fieldHint}>
            Qisqa va tushunarli yozing, o‘quvchi dars mazmunini tez tushunsin.
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("addLesson.description")}
            placeholderTextColor={Colors.subtleText}
            style={[styles.fieldInput, styles.textArea]}
            multiline
          />
        </View>

        <View style={modalStyles.fieldGroup}>
          <Text style={modalStyles.fieldLabel}>Video manbasi</Text>
          <View style={modalStyles.modeRow}>
            {[
              {
                id: "upload",
                label: t("addLesson.uploadTab"),
                icon: FileVideo,
                hint: "Fayl yuklash",
              },
              {
                id: "url",
                label: "URL",
                icon: Link2,
                hint: "Havola biriktirish",
              },
            ].map((option) => {
              const Icon = option.icon;
              const isActive = mode === option.id;

              return (
                <Pressable
                  key={option.id}
                  style={[modalStyles.modeCard, isActive && modalStyles.modeCardActive]}
                  onPress={() => setMode(option.id as LessonMediaMode)}
                >
                  <View
                    style={[modalStyles.modeIconWrap, isActive && modalStyles.modeIconWrapActive]}
                  >
                    <Icon size={16} color={isActive ? "#fff" : Colors.primary} />
                  </View>
                  <View style={modalStyles.modeCopy}>
                    <Text style={[modalStyles.modeTitle, isActive && modalStyles.modeTitleActive]}>
                      {option.label}
                    </Text>
                    <Text style={modalStyles.modeHint}>{option.hint}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {mode === "url" ? (
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>Video URL</Text>
            <TextInput
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="https://..."
              placeholderTextColor={Colors.subtleText}
              style={styles.fieldInput}
            />
          </View>
        ) : (
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t("addLesson.fileLabel")}</Text>
            <Pressable style={modalStyles.uploadCard} onPress={() => void handlePickVideo()}>
              <View style={modalStyles.uploadIconWrap}>
                <Upload size={18} color={Colors.primary} />
              </View>
              <View style={modalStyles.uploadCopy}>
                <Text style={modalStyles.uploadTitle}>
                  {selectedFile ? "Video tanlandi" : "Video faylni tanlang"}
                </Text>
                <Text style={modalStyles.uploadText}>
                  {selectedFile
                    ? selectedFile.name
                    : "MP4, MOV yoki boshqa video faylni qurilmadan yuklang"}
                </Text>
              </View>
            </Pressable>
          </View>
        )}

        {selectedFile ? (
          <View style={modalStyles.fileCard}>
            <View style={modalStyles.fileCardIcon}>
              <CirclePlay size={18} color={Colors.primary} />
            </View>
            <View style={modalStyles.fileCardCopy}>
              <Text style={styles.fileInfoTitle} numberOfLines={1}>
                {selectedFile.name}
              </Text>
              <Text style={styles.fileInfoMeta}>{formatFileSize(selectedFile.size)}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </DraggableBottomSheet>
  );
}

const modalStyles = StyleSheet.create({
  heroCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: "rgba(43, 160, 156, 0.22)",
  },
  heroIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(43, 160, 156, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  heroText: {
    color: Colors.subtleText,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  fieldHint: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
  },
  modeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
  },
  modeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  modeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(43, 160, 156, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modeIconWrapActive: {
    backgroundColor: Colors.primary,
  },
  modeCopy: {
    flex: 1,
    gap: 2,
  },
  modeTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  modeTitleActive: {
    color: Colors.primary,
  },
  modeHint: {
    color: Colors.subtleText,
    fontSize: 11,
  },
  uploadCard: {
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  uploadIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(43, 160, 156, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadCopy: {
    flex: 1,
    gap: 4,
  },
  uploadTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  uploadText: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fileCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(43, 160, 156, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  fileCardCopy: {
    flex: 1,
    gap: 2,
  },
});
