import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { CheckCircle2, ChevronDown, Clock3, Upload, X } from "lucide-react-native";
import { DraggableBottomSheet } from "../../../components/DraggableBottomSheet";
import { TextInput } from "../../../components/TextInput";
import { coursesApi } from "../../../lib/api";
import { Colors } from "../../../theme/colors";
import {
  formatHomeworkDeadlineLabel,
  HOMEWORK_FILE_CONFIG,
  HOMEWORK_TYPE_OPTIONS,
  parseLocalDateTimeValue,
  toLocalDateTimeValue,
  type HomeworkType,
} from "./homeworkModalShared";

type HomeworkEditorModalProps = {
  visible: boolean;
  courseId: string | null;
  lessonId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  pickDocument: (type?: string) => Promise<any>;
  formatFileSize: (bytes?: number | null) => string;
  styles: any;
};

export function HomeworkEditorModal({
  visible,
  courseId,
  lessonId,
  onClose,
  onSaved,
  pickDocument,
  formatFileSize,
  styles,
}: HomeworkEditorModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [type, setType] = useState<HomeworkType>("text");
  const [saving, setSaving] = useState(false);
  const [showDeadlinePickerModal, setShowDeadlinePickerModal] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState<Date>(new Date());

  const selectedTypeOption = useMemo(
    () => HOMEWORK_TYPE_OPTIONS.find((option) => option.value === type) || HOMEWORK_TYPE_OPTIONS[0],
    [type],
  );
  const selectedFileConfig = HOMEWORK_FILE_CONFIG[type];

  useEffect(() => {
    if (!visible) {
      setTitle("");
      setDescription("");
      setDeadline("");
      setMaxScore("100");
      setType("text");
      setSaving(false);
      setShowDeadlinePickerModal(false);
      setDeadlineDraft(new Date());
    }
  }, [visible]);

  const openDeadlinePicker = useCallback(() => {
    const baseDate = parseLocalDateTimeValue(deadline) || new Date();
    setDeadlineDraft(baseDate);
    setShowDeadlinePickerModal(true);
  }, [deadline]);

  const applyDeadlineDraft = useCallback(() => {
    setDeadline(toLocalDateTimeValue(deadlineDraft));
    setShowDeadlinePickerModal(false);
  }, [deadlineDraft]);

  const clearDeadline = useCallback(() => {
    setDeadline("");
    setShowDeadlinePickerModal(false);
  }, []);

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
    <>
      <DraggableBottomSheet
        visible={visible}
        title={title.trim() ? "Homeworkni tahrirlash" : "Homework qo'shish"}
        onClose={onClose}
        minHeight={560}
        initialHeightRatio={0.86}
        overlay={
          Platform.OS !== "web" && showDeadlinePickerModal ? (
            <View style={styles.homeworkPickerOverlay}>
              <Pressable
                style={styles.homeworkPickerBackdrop}
                onPress={() => setShowDeadlinePickerModal(false)}
              />
              <View style={styles.deadlinePickerModalCard}>
                <View style={styles.createHeader}>
                  <Text style={styles.createTitle}>Deadline tanlash</Text>
                  <Pressable
                    style={styles.iconCircle}
                    onPress={() => setShowDeadlinePickerModal(false)}
                  >
                    <X size={18} color={Colors.mutedText} />
                  </Pressable>
                </View>

                <View style={styles.deadlinePickerModalBody}>
                  <Text style={styles.deadlinePickerModalLabel}>Sana</Text>
                  <View style={styles.deadlinePickerCard}>
                    <DateTimePicker
                      value={deadlineDraft}
                      mode="date"
                      display="spinner"
                      onChange={(_event, selectedDate) => {
                        if (!selectedDate) return;
                        setDeadlineDraft((prev) => {
                          const next = new Date(prev);
                          next.setFullYear(
                            selectedDate.getFullYear(),
                            selectedDate.getMonth(),
                            selectedDate.getDate(),
                          );
                          return next;
                        });
                      }}
                    />
                  </View>

                  <Text style={styles.deadlinePickerModalLabel}>Vaqt</Text>
                  <View style={styles.deadlinePickerCard}>
                    <DateTimePicker
                      value={deadlineDraft}
                      mode="time"
                      display="spinner"
                      is24Hour
                      onChange={(_event, selectedDate) => {
                        if (!selectedDate) return;
                        setDeadlineDraft((prev) => {
                          const next = new Date(prev);
                          next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
                          return next;
                        });
                      }}
                    />
                  </View>
                </View>

                <View style={styles.deadlinePickerActions}>
                  <Pressable style={styles.deadlinePickerGhostButton} onPress={clearDeadline}>
                    <Text style={styles.deadlinePickerGhostText}>Tozalash</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deadlinePickerGhostButton}
                    onPress={() => setShowDeadlinePickerModal(false)}
                  >
                    <Text style={styles.deadlinePickerGhostText}>Bekor qilish</Text>
                  </Pressable>
                  <Pressable style={styles.deadlinePickerPrimaryButton} onPress={applyDeadlineDraft}>
                    <Text style={styles.deadlinePickerPrimaryText}>Tayyor</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null
        }
        footer={
          showDeadlinePickerModal ? null : (
            <View style={styles.homeworkEditorFooter}>
              <Pressable style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryButtonText}>Bekor qilish</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, (!title.trim() || saving) && styles.sendButtonDisabled]}
                disabled={!title.trim() || saving}
                onPress={() => void handleSave()}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Saqlash</Text>
                )}
              </Pressable>
            </View>
          )
        }
      >
        <View style={styles.homeworkEditorBody}>
          <ScrollView
            style={styles.homeworkEditorScroll}
            contentContainerStyle={styles.homeworkEditorContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.homeworkEditorIntro}>
              <Text style={styles.homeworkEditorIntroTitle}>
                Topshiriq turi, deadline va maksimal balni belgilang.
              </Text>
              <Text style={styles.homeworkEditorIntroText}>
                Frontenddagi homework editor oqimiga yaqinlashtirilgan sheet.
              </Text>
            </View>

            <View style={styles.homeworkEditorField}>
              <Text style={styles.homeworkEditorLabel}>Sarlavha</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Topshiriq sarlavhasi"
                placeholderTextColor={Colors.subtleText}
                style={styles.fieldInput}
              />
            </View>

            <View style={styles.homeworkEditorField}>
              <Text style={styles.homeworkEditorLabel}>Tavsif</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Topshiriq tavsifi"
                placeholderTextColor={Colors.subtleText}
                style={[styles.fieldInput, styles.textArea]}
                multiline
              />
            </View>

            <View style={styles.homeworkEditorField}>
              <Text style={styles.homeworkEditorLabel}>Topshiriq turi</Text>
              <View style={styles.homeworkTypeList}>
                {HOMEWORK_TYPE_OPTIONS.map((option) => {
                  const isActive = type === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[styles.homeworkTypeCard, isActive && styles.homeworkTypeCardActive]}
                      onPress={() => setType(option.value)}
                    >
                      <View
                        style={[
                          styles.homeworkTypeIconWrap,
                          isActive && styles.homeworkTypeIconWrapActive,
                        ]}
                      >
                        <Ionicons
                          name={option.icon as any}
                          size={18}
                          color={isActive ? "#fff" : Colors.primary}
                        />
                      </View>
                      <View style={styles.homeworkTypeCopy}>
                        <Text
                          style={[styles.homeworkTypeTitle, isActive && styles.homeworkTypeTitleActive]}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={[styles.homeworkTypeHint, isActive && styles.homeworkTypeHintActive]}
                        >
                          {option.hint}
                        </Text>
                      </View>
                      {isActive ? <CheckCircle2 size={18} color={Colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.homeworkUploadHintCard}>
              <View style={styles.homeworkUploadHintHeader}>
                <View style={styles.homeworkUploadHintIcon}>
                  <Upload size={18} color={Colors.primary} />
                </View>
                <View style={styles.homeworkUploadHintCopy}>
                  <Text style={styles.homeworkUploadHintTitle}>
                    {selectedTypeOption.label} topshirish oqimi
                  </Text>
                  <Text style={styles.homeworkUploadHintText}>{selectedTypeOption.hint}</Text>
                </View>
              </View>
              {selectedFileConfig ? (
                <>
                  <View style={styles.homeworkUploadHintMetaRow}>
                    <Text style={styles.homeworkUploadHintMetaLabel}>Formatlar</Text>
                    <Text style={styles.homeworkUploadHintMetaValue}>
                      {selectedFileConfig.extensions}
                    </Text>
                  </View>
                  <View style={styles.homeworkUploadHintMetaRow}>
                    <Text style={styles.homeworkUploadHintMetaLabel}>Limit</Text>
                    <Text style={styles.homeworkUploadHintMetaValue}>
                      {formatFileSize(selectedFileConfig.maxBytes)} gacha
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.homeworkUploadHintText}>
                  Bu turda talaba matn yoki link bilan javob yuboradi.
                </Text>
              )}
            </View>

            <View style={styles.homeworkEditorRow}>
              <View style={[styles.homeworkEditorField, styles.homeworkEditorHalfField]}>
                <Text style={styles.homeworkEditorLabel}>Deadline</Text>
                {Platform.OS === "web" ? (
                  <TextInput
                    value={deadline}
                    onChangeText={setDeadline}
                    placeholder="2026-03-30T18:00"
                    placeholderTextColor={Colors.subtleText}
                    style={styles.fieldInput}
                  />
                ) : (
                  <>
                    <Pressable style={styles.deadlineFieldButton} onPress={openDeadlinePicker}>
                      <View style={styles.deadlineFieldLeft}>
                        <View style={styles.deadlineFieldIcon}>
                          <Clock3 size={16} color={Colors.primary} />
                        </View>
                        <View style={styles.deadlineFieldCopy}>
                          <Text style={styles.deadlineFieldLabel}>Sana va vaqt</Text>
                          <Text
                            style={[
                              styles.deadlineFieldValue,
                              !deadline && styles.deadlineFieldValuePlaceholder,
                            ]}
                          >
                            {formatHomeworkDeadlineLabel(deadline)}
                          </Text>
                        </View>
                      </View>
                      <ChevronDown size={16} color={Colors.mutedText} />
                    </Pressable>
                    {deadline ? (
                      <Pressable style={styles.deadlineClearButton} onPress={clearDeadline}>
                        <Text style={styles.deadlineClearButtonText}>Tozalash</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>

              <View style={[styles.homeworkEditorField, styles.homeworkEditorHalfField]}>
                <Text style={styles.homeworkEditorLabel}>Max ball</Text>
                <TextInput
                  value={maxScore}
                  onChangeText={setMaxScore}
                  placeholder="100"
                  placeholderTextColor={Colors.subtleText}
                  keyboardType="number-pad"
                  style={styles.fieldInput}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </DraggableBottomSheet>
    </>
  );
}
