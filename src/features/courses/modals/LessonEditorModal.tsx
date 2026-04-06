import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { DocumentPickerAsset } from "expo-document-picker";
import { Upload } from "lucide-react-native";
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
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("addLesson.lessonName")}
          placeholderTextColor={Colors.subtleText}
          style={styles.fieldInput}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t("addLesson.description")}
          placeholderTextColor={Colors.subtleText}
          style={[styles.fieldInput, styles.textArea]}
          multiline
        />

        <View style={styles.accessRow}>
          {[
            { id: "upload", label: t("addLesson.uploadTab") },
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
              {selectedFile ? selectedFile.name : t("addLesson.fileLabel")}
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
    </DraggableBottomSheet>
  );
}
