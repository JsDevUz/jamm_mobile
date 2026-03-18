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
import { X } from "lucide-react-native";
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalKeyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
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
