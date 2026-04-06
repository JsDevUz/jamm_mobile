import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Upload } from "lucide-react-native";
import { DraggableBottomSheet } from "../../../components/DraggableBottomSheet";
import { TextInput } from "../../../components/TextInput";
import { coursesApi } from "../../../lib/api";
import { Colors } from "../../../theme/colors";
import type { CourseHomeworkAssignment } from "../../../types/courses";

type HomeworkSubmitModalProps = {
  visible: boolean;
  courseId: string | null;
  lessonId: string | null;
  assignment: CourseHomeworkAssignment | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  pickDocument: (type?: string) => Promise<any>;
  styles: any;
};

export function HomeworkSubmitModal({
  visible,
  courseId,
  lessonId,
  assignment,
  onClose,
  onSaved,
  pickDocument,
  styles,
}: HomeworkSubmitModalProps) {
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
    <DraggableBottomSheet
      visible={visible}
      title={assignment?.title || "Homework topshirish"}
      onClose={onClose}
      minHeight={500}
      initialHeightRatio={0.72}
      maxHeightRatio={0.9}
      footer={
        <View style={styles.createFooter}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, saving && styles.sendButtonDisabled]}
            disabled={saving}
            onPress={() => void handleSubmit()}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Yuborish</Text>
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
            <Text style={styles.mediaPickerText}>{file ? file.name : "Fayl tanlash"}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </DraggableBottomSheet>
  );
}
