import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
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

export function LinkedTestModal({
  visible,
  courseId,
  lessonId,
  onClose,
  onSaved,
}: Props) {
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
    <DraggableBottomSheet
      visible={visible}
      title="Arena mashqi qo'shish"
      onClose={onClose}
      minHeight={420}
      initialHeightRatio={0.58}
      maxHeightRatio={0.86}
      footer={
        <View style={styles.createFooter}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, (!url.trim() || saving) && styles.sendButtonDisabled]}
            disabled={!url.trim() || saving}
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
      </ScrollView>
    </DraggableBottomSheet>
  );
}
