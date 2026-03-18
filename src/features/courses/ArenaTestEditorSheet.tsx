import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  BookCopy,
  CheckCircle2,
  Circle,
  FileText,
  Plus,
  Trash2,
  Type,
} from "lucide-react-native";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { TextInput } from "../../components/TextInput";
import { APP_LIMITS } from "../../constants/appLimits";
import { arenaApi } from "../../lib/api";
import { Colors } from "../../theme/colors";
import type {
  ArenaTestMutationPayload,
  ArenaTestPayload,
  ArenaTestQuestionInput,
} from "../../types/arena";

type Props = {
  visible: boolean;
  testId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type EditorMode = "manual" | "template";

const MAX_QUESTIONS = 30;
const MAX_OPTIONS = 4;

function createEmptyQuestion(): ArenaTestQuestionInput {
  return {
    questionText: "",
    options: ["", ""],
    correctOptionIndex: 0,
  };
}

function parseTemplate(text: string): ArenaTestQuestionInput[] {
  const parsedQuestions: ArenaTestQuestionInput[] = [];
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let currentQuestion: ArenaTestQuestionInput | null = null;

  for (const line of lines) {
    if (line.startsWith("$")) {
      if (
        currentQuestion &&
        currentQuestion.questionText &&
        currentQuestion.options.length >= 2
      ) {
        if (currentQuestion.correctOptionIndex < 0) {
          throw new Error(
            `Savolga to'g'ri javob belgilanmagan: ${currentQuestion.questionText}`,
          );
        }
        parsedQuestions.push(currentQuestion);
      }

      currentQuestion = {
        questionText: line
          .slice(1)
          .trim()
          .slice(0, APP_LIMITS.testQuestionChars),
        options: [],
        correctOptionIndex: -1,
      };
      continue;
    }

    if (line.startsWith("+")) {
      if (!currentQuestion) {
        throw new Error("Javobdan oldin savol yozilishi ($) kerak");
      }

      currentQuestion.options.push(
        line
          .slice(1)
          .trim()
          .slice(0, APP_LIMITS.testOptionChars),
      );
      currentQuestion.correctOptionIndex = currentQuestion.options.length - 1;
      continue;
    }

    if (line.startsWith("-")) {
      if (!currentQuestion) {
        throw new Error("Javobdan oldin savol yozilishi ($) kerak");
      }

      currentQuestion.options.push(
        line
          .slice(1)
          .trim()
          .slice(0, APP_LIMITS.testOptionChars),
      );
      continue;
    }

    throw new Error(`Tushunarsiz qator: ${line}. Faqat $, +, - ishlating.`);
  }

  if (currentQuestion) {
    if (currentQuestion.correctOptionIndex < 0) {
      throw new Error(
        `Savolga to'g'ri javob belgilanmagan: ${currentQuestion.questionText}`,
      );
    }

    if (currentQuestion.options.length < 2) {
      throw new Error(
        `Savolda kamida 2 ta javob bo'lishi kerak: ${currentQuestion.questionText}`,
      );
    }

    parsedQuestions.push(currentQuestion);
  }

  return parsedQuestions;
}

export function ArenaTestEditorSheet({ visible, testId, onClose, onSaved }: Props) {
  const isEditing = Boolean(testId);
  const [mode, setMode] = useState<EditorMode>("manual");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [displayMode, setDisplayMode] = useState<"single" | "list">("single");
  const [questions, setQuestions] = useState<ArenaTestQuestionInput[]>([createEmptyQuestion()]);
  const [templateText, setTemplateText] = useState("");
  const [saving, setSaving] = useState(false);

  const detailQuery = useQuery<ArenaTestPayload>({
    queryKey: ["arena-test", "editor-sheet", testId || "create"],
    queryFn: () => arenaApi.fetchTestById(testId || "") as Promise<ArenaTestPayload>,
    enabled: visible && isEditing,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const hydratedQuestions = useMemo(() => {
    if (!Array.isArray(detailQuery.data?.questions) || detailQuery.data.questions.length === 0) {
      return [createEmptyQuestion()];
    }

    return detailQuery.data.questions.map((question) => ({
      questionText: String(question.questionText || question.question || question.prompt || "")
        .slice(0, APP_LIMITS.testQuestionChars),
      options:
        Array.isArray(question.options) && question.options.length >= 2
          ? question.options.map((option) =>
              String(option || "").slice(0, APP_LIMITS.testOptionChars),
            )
          : ["", ""],
      correctOptionIndex: Number(question.correctOptionIndex) || 0,
    }));
  }, [detailQuery.data?.questions]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSaving(false);

    if (isEditing) {
      if (!detailQuery.data) {
        return;
      }

      setMode("manual");
      setTitle(String(detailQuery.data.title || "").slice(0, APP_LIMITS.testTitleChars));
      setDescription(
        String(detailQuery.data.description || "").slice(0, APP_LIMITS.testDescriptionChars),
      );
      setDisplayMode(detailQuery.data.displayMode === "list" ? "list" : "single");
      setQuestions(hydratedQuestions);
      setTemplateText("");
      return;
    }

    setMode("manual");
    setTitle("");
    setDescription("");
    setDisplayMode("single");
    setQuestions([createEmptyQuestion()]);
    setTemplateText("");
  }, [detailQuery.data, hydratedQuestions, isEditing, visible]);

  const updateQuestion = (
    questionIndex: number,
    updater: (question: ArenaTestQuestionInput) => ArenaTestQuestionInput,
  ) => {
    setQuestions((prev) =>
      prev.map((question, index) =>
        index === questionIndex ? updater(question) : question,
      ),
    );
  };

  const handleAddQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) {
      Alert.alert("Limitga yetildi", "Maksimal 30 ta savol qo'shish mumkin.");
      return;
    }

    setQuestions((prev) => [...prev, createEmptyQuestion()]);
  };

  const handleRemoveQuestion = (questionIndex: number) => {
    setQuestions((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter((_, index) => index !== questionIndex);
    });
  };

  const handleAddOption = (questionIndex: number) => {
    updateQuestion(questionIndex, (question) =>
      question.options.length >= MAX_OPTIONS
        ? question
        : {
            ...question,
            options: [...question.options, ""],
          },
    );
  };

  const handleRemoveOption = (questionIndex: number, optionIndex: number) => {
    updateQuestion(questionIndex, (question) => {
      if (question.options.length <= 2) {
        return question;
      }

      const nextOptions = question.options.filter((_, index) => index !== optionIndex);
      const nextCorrectIndex =
        question.correctOptionIndex === optionIndex
          ? 0
          : question.correctOptionIndex > optionIndex
            ? question.correctOptionIndex - 1
            : question.correctOptionIndex;

      return {
        ...question,
        options: nextOptions,
        correctOptionIndex: nextCorrectIndex,
      };
    });
  };

  const validateManualMode = () => {
    if (!title.trim()) {
      return "Testga nom bering!";
    }

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      if (!question.questionText.trim()) {
        return `${index + 1}-savol matni bo'sh!`;
      }

      if (question.options.some((option) => !option.trim())) {
        return `${index + 1}-savolning barcha javoblarini to'ldiring!`;
      }
    }

    return null;
  };

  const buildPayloadQuestions = () => {
    if (mode === "manual") {
      const validationError = validateManualMode();
      if (validationError) {
        throw new Error(validationError);
      }

      return questions.map((question) => ({
        questionText: question.questionText.trim(),
        options: question.options.map((option) => option.trim()),
        correctOptionIndex: question.correctOptionIndex,
      }));
    }

    const parsedQuestions = parseTemplate(templateText);
    if (parsedQuestions.length === 0) {
      throw new Error("Andazada hech qanday savol topilmadi.");
    }

    if (parsedQuestions.length > MAX_QUESTIONS) {
      throw new Error("Andazada savollar soni 30 tadan oshmasligi kerak!");
    }

    return parsedQuestions;
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Tekshirib chiqing", "Testga nom bering!");
      return;
    }

    let payloadQuestions: ArenaTestQuestionInput[];

    try {
      payloadQuestions = buildPayloadQuestions();
    } catch (error) {
      Alert.alert(
        "Tekshirib chiqing",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
      return;
    }

    const payload: ArenaTestMutationPayload = {
      title: title.trim(),
      description: description.trim(),
      isPublic: true,
      displayMode,
      questions: payloadQuestions,
    };

    setSaving(true);
    try {
      if (isEditing && testId) {
        await arenaApi.updateTest(testId, payload as unknown as Record<string, unknown>);
      } else {
        await arenaApi.createTest(payload as unknown as Record<string, unknown>);
      }
      await Promise.resolve(onSaved());
      onClose();
    } catch (error) {
      Alert.alert(
        isEditing ? "Test yangilanmadi" : "Test yaratilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <View style={styles.footerRow}>
      <Pressable style={styles.footerSecondaryButton} onPress={onClose}>
        <Text style={styles.footerSecondaryButtonText}>Bekor qilish</Text>
      </Pressable>
      <Pressable
        style={[styles.footerPrimaryButton, saving && styles.footerDisabledButton]}
        disabled={saving}
        onPress={() => void handleSave()}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.footerPrimaryButtonText}>
            {isEditing ? "O'zgarishlarni saqlash" : "Testni yaratish"}
          </Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <DraggableBottomSheet
      visible={visible}
      title={isEditing ? "Testni tahrirlash" : "Yangi test yaratish"}
      onClose={onClose}
      footer={footer}
      minHeight={680}
      initialHeightRatio={0.92}
      maxHeightRatio={0.97}
    >
      {isEditing && detailQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : isEditing && detailQuery.isError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Test yuklanmadi</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => void detailQuery.refetch()}
          >
            <Text style={styles.retryButtonText}>Qayta yuklash</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.group}>
            <Text style={styles.label}>Test nomi</Text>
            <TextInput
              value={title}
              onChangeText={(value) => setTitle(value.slice(0, APP_LIMITS.testTitleChars))}
              placeholder="Masalan: JavaScript Asoslari"
              placeholderTextColor={Colors.subtleText}
              style={styles.input}
              maxLength={APP_LIMITS.testTitleChars}
            />
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>Test haqida (ixtiyoriy)</Text>
            <TextInput
              value={description}
              onChangeText={(value) =>
                setDescription(value.slice(0, APP_LIMITS.testDescriptionChars))
              }
              placeholder="Qisqacha tavsif..."
              placeholderTextColor={Colors.subtleText}
              style={styles.input}
              maxLength={APP_LIMITS.testDescriptionChars}
            />
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>Test ko'rinishi</Text>
            <View style={styles.segmentedRow}>
              <Pressable
                style={[
                  styles.segmentButton,
                  displayMode === "single" && styles.segmentButtonActive,
                ]}
                onPress={() => setDisplayMode("single")}
              >
                <BookCopy
                  size={15}
                  color={displayMode === "single" ? Colors.primary : Colors.text}
                />
                <Text
                  style={[
                    styles.segmentButtonText,
                    displayMode === "single" && styles.segmentButtonTextActive,
                  ]}
                >
                  1-talab
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.segmentButton,
                  displayMode === "list" && styles.segmentButtonActive,
                ]}
                onPress={() => setDisplayMode("list")}
              >
                <FileText
                  size={15}
                  color={displayMode === "list" ? Colors.primary : Colors.text}
                />
                <Text
                  style={[
                    styles.segmentButtonText,
                    displayMode === "list" && styles.segmentButtonTextActive,
                  ]}
                >
                  Ro'yxat
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>Kiritish usuli</Text>
            <View style={styles.segmentedRow}>
              <Pressable
                style={[styles.segmentButton, mode === "manual" && styles.segmentButtonActive]}
                onPress={() => setMode("manual")}
              >
                <Plus
                  size={15}
                  color={mode === "manual" ? Colors.primary : Colors.text}
                />
                <Text
                  style={[
                    styles.segmentButtonText,
                    mode === "manual" && styles.segmentButtonTextActive,
                  ]}
                >
                  Qo'lda
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segmentButton, mode === "template" && styles.segmentButtonActive]}
                onPress={() => setMode("template")}
              >
                <Type
                  size={15}
                  color={mode === "template" ? Colors.primary : Colors.text}
                />
                <Text
                  style={[
                    styles.segmentButtonText,
                    mode === "template" && styles.segmentButtonTextActive,
                  ]}
                >
                  Andaza
                </Text>
              </Pressable>
            </View>
          </View>

          {mode === "manual" ? (
            <>
              <View style={styles.questionsHeader}>
                <Text style={styles.label}>Savollar</Text>
                <Pressable
                  style={styles.inlineAction}
                  disabled={questions.length >= MAX_QUESTIONS}
                  onPress={handleAddQuestion}
                >
                  <Plus size={14} color={Colors.primary} />
                  <Text style={styles.inlineActionText}>Savol qo'shish</Text>
                </Pressable>
              </View>

              {questions.map((question, questionIndex) => (
                <View key={`question-${questionIndex}`} style={styles.questionCard}>
                  <View style={styles.questionHeader}>
                    <Text style={styles.questionTitle}>{questionIndex + 1} - Savol</Text>
                    <Pressable
                      style={styles.iconButton}
                      disabled={questions.length <= 1}
                      onPress={() => handleRemoveQuestion(questionIndex)}
                    >
                      <Trash2
                        size={16}
                        color={questions.length <= 1 ? Colors.subtleText : Colors.danger}
                      />
                    </Pressable>
                  </View>

                  <TextInput
                    value={question.questionText}
                    onChangeText={(value) =>
                      updateQuestion(questionIndex, (current) => ({
                        ...current,
                        questionText: value.slice(0, APP_LIMITS.testQuestionChars),
                      }))
                    }
                    placeholder="Savol matni..."
                    placeholderTextColor={Colors.subtleText}
                    style={styles.input}
                  />

                  <View style={styles.optionsHeader}>
                    <Text style={styles.optionHint}>
                      Javob variantlari (to'g'ri javobni belgilang)
                    </Text>
                  </View>

                  <View style={styles.optionsWrap}>
                    {question.options.map((option, optionIndex) => {
                      const isCorrect = question.correctOptionIndex === optionIndex;

                      return (
                        <View
                          key={`option-${questionIndex}-${optionIndex}`}
                          style={styles.optionRow}
                        >
                          <Pressable
                            style={styles.correctToggle}
                            onPress={() =>
                              updateQuestion(questionIndex, (current) => ({
                                ...current,
                                correctOptionIndex: optionIndex,
                              }))
                            }
                          >
                            {isCorrect ? (
                              <CheckCircle2 size={20} color={Colors.accent} />
                            ) : (
                              <Circle size={20} color={Colors.subtleText} />
                            )}
                          </Pressable>

                          <TextInput
                            value={option}
                            onChangeText={(value) =>
                              updateQuestion(questionIndex, (current) => ({
                                ...current,
                                options: current.options.map((currentOption, index) =>
                                  index === optionIndex
                                    ? value.slice(0, APP_LIMITS.testOptionChars)
                                    : currentOption,
                                ),
                              }))
                            }
                            placeholder={`${optionIndex + 1} - variant`}
                            placeholderTextColor={Colors.subtleText}
                            style={[styles.input, styles.optionInput]}
                          />

                          <Pressable
                            style={styles.iconButton}
                            disabled={question.options.length <= 2}
                            onPress={() => handleRemoveOption(questionIndex, optionIndex)}
                          >
                            <Trash2
                              size={16}
                              color={
                                question.options.length <= 2
                                  ? Colors.subtleText
                                  : Colors.danger
                              }
                            />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>

                  {question.options.length < MAX_OPTIONS ? (
                    <Pressable
                      style={styles.inlineAction}
                      onPress={() => handleAddOption(questionIndex)}
                    >
                      <Plus size={14} color={Colors.primary} />
                      <Text style={styles.inlineActionText}>Variant qo'shish</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}

              <Pressable
                style={[
                  styles.addQuestionButton,
                  questions.length >= MAX_QUESTIONS && styles.addQuestionButtonDisabled,
                ]}
                disabled={questions.length >= MAX_QUESTIONS}
                onPress={handleAddQuestion}
              >
                <Plus
                  size={16}
                  color={questions.length >= MAX_QUESTIONS ? Colors.subtleText : Colors.text}
                />
                <Text
                  style={[
                    styles.addQuestionText,
                    questions.length >= MAX_QUESTIONS && styles.addQuestionTextDisabled,
                  ]}
                >
                  {questions.length >= MAX_QUESTIONS
                    ? "Limitga yetildi (30/30)"
                    : "Yana savol qo'shish"}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.group}>
              <View style={styles.hintCard}>
                <Text style={styles.hintTitle}>Andaza qoidalari</Text>
                <Text style={styles.hintText}>`$` bilan savolni boshlang.</Text>
                <Text style={styles.hintText}>`-` bilan xato javoblarni kiriting.</Text>
                <Text style={styles.hintText}>`+` bilan bitta to'g'ri javobni kiriting.</Text>
                <Text style={styles.hintText}>
                  Qator tashlab navbatdagi savolga o'tasiz.
                </Text>
              </View>

              <TextInput
                value={templateText}
                onChangeText={setTemplateText}
                placeholder={
                  "$ JavaScript qaysi yilda yaratilgan?\n- 1990\n- 1994\n+ 1995\n- 2000\n\n$ Const qanday o'zgaruvchi?\n- O'zgaruvchan\n+ O'zgarmas\n- Funksiya"
                }
                placeholderTextColor={Colors.subtleText}
                style={[styles.input, styles.templateInput]}
                multiline
                textAlignVertical="top"
              />
            </View>
          )}
        </ScrollView>
      )}
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 16,
  },
  centerState: {
    flex: 1,
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  stateTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  group: {
    gap: 8,
  },
  label: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  segmentedRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  segmentButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  segmentButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  segmentButtonTextActive: {
    color: Colors.primary,
  },
  questionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  questionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 14,
    gap: 12,
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  questionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  optionsHeader: {
    gap: 6,
  },
  optionHint: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  optionsWrap: {
    gap: 10,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  correctToggle: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  optionInput: {
    flex: 1,
  },
  inlineAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.primarySoft,
  },
  inlineActionText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  addQuestionButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  addQuestionButtonDisabled: {
    opacity: 0.64,
  },
  addQuestionText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  addQuestionTextDisabled: {
    color: Colors.subtleText,
  },
  hintCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 14,
    gap: 6,
  },
  hintTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  hintText: {
    color: Colors.subtleText,
    fontSize: 13,
    lineHeight: 19,
  },
  templateInput: {
    minHeight: 260,
    textAlignVertical: "top",
  },
  retryButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
  },
  footerSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  footerSecondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  footerPrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  footerPrimaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  footerDisabledButton: {
    opacity: 0.6,
  },
});
