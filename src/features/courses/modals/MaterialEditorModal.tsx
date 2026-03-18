import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { FileText, X } from "lucide-react-native";
import { TextInput } from "../../../components/TextInput";
import { coursesApi } from "../../../lib/api";
import { Colors } from "../../../theme/colors";
import { courseEditorModalStyles as styles } from "./courseEditorModalStyles";

type Props = {
  visible: boolean;
  courseId: string | null;
  lessonId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

export function MaterialEditorModal({
  visible,
  courseId,
  lessonId,
  onClose,
  onSaved,
}: Props) {
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
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    const selected = result.assets[0];
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
      <KeyboardAvoidingView
        style={styles.modalKeyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
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
                <Text style={styles.mediaPickerText}>{file ? file.name : "PDF tanlash"}</Text>
              </Pressable>
            </View>
            <View style={styles.createFooter}>
              <Pressable style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primaryButton,
                  (!title.trim() || !file || saving) && styles.sendButtonDisabled,
                ]}
                disabled={!title.trim() || !file || saving}
                onPress={() => void handleSave()}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Saqlash</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
