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
import { Plus, Trash2 } from "lucide-react-native";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { TextInput } from "../../components/TextInput";
import { APP_LIMITS } from "../../constants/appLimits";
import { arenaApi } from "../../lib/api";
import { Colors } from "../../theme/colors";
import type { ArenaSentenceBuilderDeck } from "../../types/arena";
import {
  createEmptySentenceBuilderItem,
  normalizeSentenceBuilderItemsForPayload,
  parsePatternToSentenceBuilderItems,
  splitAnswerTokens,
  type SentenceBuilderEditorItem,
} from "./ArenaSentenceBuilderUtils";

type Props = {
  visible: boolean;
  deck: ArenaSentenceBuilderDeck | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

export function ArenaSentenceBuilderEditorSheet({
  visible,
  deck,
  onClose,
  onSaved,
}: Props) {
  const isEditing = Boolean(deck?._id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pattern, setPattern] = useState("");
  const [items, setItems] = useState<SentenceBuilderEditorItem[]>([
    createEmptySentenceBuilderItem(),
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (isEditing) {
      setTitle(String(deck?.title || ""));
      setDescription(String(deck?.description || ""));
      setPattern("");
      setItems(
        (deck?.items || []).length
          ? (deck?.items || []).map((item) => ({
              prompt: String(item.prompt || ""),
              answer: Array.isArray(item.answerTokens)
                ? item.answerTokens.join(" ")
                : String(item.answer || ""),
              extraTokens: Array.isArray(item.extraTokens)
                ? item.extraTokens.join(", ")
                : "",
            }))
          : [createEmptySentenceBuilderItem()],
      );
      return;
    }

    setTitle("");
    setDescription("");
    setPattern("");
    setItems([createEmptySentenceBuilderItem()]);
  }, [deck, isEditing, visible]);

  const validCount = useMemo(
    () => items.filter((item) => item.prompt.trim() && item.answer.trim()).length,
    [items],
  );

  const updateItem = (
    index: number,
    field: keyof SentenceBuilderEditorItem,
    value: string,
  ) => {
    const limitMap: Record<keyof SentenceBuilderEditorItem, number> = {
      prompt: APP_LIMITS.sentenceBuilderPromptChars,
      answer: APP_LIMITS.sentenceBuilderAnswerChars,
      extraTokens: APP_LIMITS.sentenceBuilderDescriptionChars,
    };

    setItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value.slice(0, limitMap[field]),
            }
          : item,
      ),
    );
  };

  const handleAddItem = () => {
    if (items.length >= 30) {
      Alert.alert("Limit", "Bitta to'plamga maksimal 30 ta savol qo'shiladi.");
      return;
    }

    setItems((previous) => [...previous, createEmptySentenceBuilderItem()]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((previous) =>
      previous.length === 1
        ? [createEmptySentenceBuilderItem()]
        : previous.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Nom kerak", "To'plam nomini kiriting.");
      return;
    }

    const parsedPatternItems = parsePatternToSentenceBuilderItems(pattern);
    const finalItems = normalizeSentenceBuilderItemsForPayload(items);

    if (!parsedPatternItems.length && !finalItems.length) {
      Alert.alert("Savol kerak", "Kamida bitta savol kiriting.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        items: parsedPatternItems.length
          ? undefined
          : finalItems,
        pattern: parsedPatternItems.length ? pattern.trim() : "",
      };

      if (isEditing && deck?._id) {
        await arenaApi.updateSentenceBuilderDeck(String(deck._id), payload);
      } else {
        await arenaApi.createSentenceBuilderDeck(payload);
      }

      await Promise.resolve(onSaved());
      onClose();
    } catch (error) {
      Alert.alert(
        "Saqlanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DraggableBottomSheet
      visible={visible}
      title={isEditing ? "Gap tuzishni tahrirlash" : "Yangi gap tuzish"}
      onClose={onClose}
      minHeight={620}
      initialHeightRatio={0.92}
      maxHeightRatio={0.98}
      footer={
        <View style={styles.footer}>
          <Text style={styles.footerInfo}>Tayyor savollar: {validCount}</Text>
          <Pressable
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>{isEditing ? "Saqlash" : "Yaratish"}</Text>
            )}
          </Pressable>
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.group}>
          <Text style={styles.label}>To'plam nomi</Text>
          <TextInput
            value={title}
            onChangeText={(value) =>
              setTitle(value.slice(0, APP_LIMITS.sentenceBuilderTitleChars))
            }
            placeholder="Masalan: Past Simple gaplari"
            placeholderTextColor={Colors.subtleText}
            style={styles.input}
          />
          <Text style={styles.counter}>
            {title.length}/{APP_LIMITS.sentenceBuilderTitleChars}
          </Text>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Tavsif</Text>
          <TextInput
            value={description}
            onChangeText={(value) =>
              setDescription(value.slice(0, APP_LIMITS.sentenceBuilderDescriptionChars))
            }
            placeholder="Bu to'plam nima haqida?"
            placeholderTextColor={Colors.subtleText}
            multiline
            style={[styles.input, styles.textarea]}
          />
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Pattern orqali qo'shish</Text>
          <TextInput
            value={pattern}
            onChangeText={(value) =>
              setPattern(value.slice(0, APP_LIMITS.sentenceBuilderDescriptionChars * 10))
            }
            placeholder={`$Men kecha maktabga bordim.\n"I went to school yesterday"\n+my,are,today,tomorrow,go,will+`}
            placeholderTextColor={Colors.subtleText}
            multiline
            style={[styles.input, styles.patternInput]}
          />
          <Text style={styles.helperText}>
            Pattern to'ldirilsa bloklardan savollar avtomatik olinadi. Chalg'ituvchi
            bo'laklarni `+token1,token2+` ko'rinishida yozing.
          </Text>
        </View>

        <Text style={styles.helperText}>
          Har savolda prompt va to'g'ri javobni kiriting. Javob avtomatik bo'laklarga
          ajratiladi, chalg'ituvchi bo'laklarni esa vergul bilan yozing.
        </Text>

        <View style={styles.cardStack}>
          {items.map((item, index) => {
            const answerTokens = splitAnswerTokens(item.answer);
            const extraTokens = item.extraTokens
              .split(",")
              .map((token) => token.trim())
              .filter(Boolean);

            return (
              <View key={`sentence-builder-editor-${index}`} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Savol #{index + 1}</Text>
                  {items.length > 1 ? (
                    <Pressable onPress={() => handleRemoveItem(index)} style={styles.iconButton}>
                      <Trash2 size={16} color={Colors.danger} />
                    </Pressable>
                  ) : null}
                </View>

                <Text style={styles.label}>Savol / Prompt</Text>
                <TextInput
                  value={item.prompt}
                  onChangeText={(value) => updateItem(index, "prompt", value)}
                  placeholder="Masalan: Men kecha maktabga bordim."
                  placeholderTextColor={Colors.subtleText}
                  multiline
                  style={[styles.input, styles.textarea]}
                />

                <Text style={styles.label}>To'g'ri javob</Text>
                <TextInput
                  value={item.answer}
                  onChangeText={(value) => updateItem(index, "answer", value)}
                  placeholder="Masalan: I went to school yesterday"
                  placeholderTextColor={Colors.subtleText}
                  style={styles.input}
                />
                {answerTokens.length ? (
                  <View style={styles.tokenWrap}>
                    {answerTokens.map((token, tokenIndex) => (
                      <View key={`${token}-${tokenIndex}`} style={[styles.tokenChip, styles.tokenChipAnswer]}>
                        <Text style={styles.tokenText}>{token}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.label}>Chalg'ituvchi bo'laklar</Text>
                <TextInput
                  value={item.extraTokens}
                  onChangeText={(value) => updateItem(index, "extraTokens", value)}
                  placeholder="Masalan: my, are, today, tomorrow"
                  placeholderTextColor={Colors.subtleText}
                  style={styles.input}
                />
                {extraTokens.length ? (
                  <View style={styles.tokenWrap}>
                    {extraTokens.map((token, tokenIndex) => (
                      <View key={`${token}-${tokenIndex}`} style={[styles.tokenChip, styles.tokenChipExtra]}>
                        <Text style={styles.tokenText}>{token}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <Pressable style={styles.addButton} onPress={handleAddItem}>
          <Plus size={16} color="#fff" />
          <Text style={styles.addButtonText}>Yana savol qo'shish</Text>
        </Pressable>
      </ScrollView>
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  group: {
    gap: 8,
  },
  label: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    minHeight: 48,
    padding: 12,
  },
  textarea: {
    minHeight: 96,
  },
  patternInput: {
    minHeight: 180,
  },
  counter: {
    color: Colors.mutedText,
    fontSize: 12,
    textAlign: "right",
  },
  helperText: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  cardStack: {
    gap: 14,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
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
    backgroundColor: Colors.background,
  },
  tokenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tokenChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tokenChipAnswer: {
    borderColor: "rgba(59,130,246,0.28)",
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  tokenChipExtra: {
    borderColor: "rgba(244,114,182,0.25)",
    backgroundColor: "rgba(244,114,182,0.12)",
  },
  tokenText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  addButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerInfo: {
    flex: 1,
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  saveButton: {
    minWidth: 116,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
