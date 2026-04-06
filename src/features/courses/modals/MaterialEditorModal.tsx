import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { FileText } from "lucide-react-native";
import { DraggableBottomSheet } from "../../../components/DraggableBottomSheet";
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
    <DraggableBottomSheet
      visible={visible}
      title="Material qo'shish"
      onClose={onClose}
      minHeight={380}
      initialHeightRatio={0.54}
      maxHeightRatio={0.84}
      footer={
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
          placeholder="Material nomi"
          placeholderTextColor={Colors.subtleText}
          style={styles.fieldInput}
        />
        <Pressable style={styles.mediaPicker} onPress={() => void pickPdf()}>
          <FileText size={16} color={Colors.primary} />
          <Text style={styles.mediaPickerText}>{file ? file.name : "PDF tanlash"}</Text>
        </Pressable>
      </ScrollView>
    </DraggableBottomSheet>
  );
}
