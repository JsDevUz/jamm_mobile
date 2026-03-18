import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image as ImageIcon, Plus, Search, Trash2, X } from "lucide-react-native";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { TextInput } from "../../components/TextInput";
import { APP_LIMITS } from "../../constants/appLimits";
import { arenaApi } from "../../lib/api";
import { Colors } from "../../theme/colors";
import type {
  ArenaFlashcardCardInput,
  ArenaFlashcardDeck,
  ArenaFlashcardMutationPayload,
} from "../../types/arena";

type Props = {
  visible: boolean;
  deck: ArenaFlashcardDeck | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type InputMode = "manual" | "template";
type ImageModalState = {
  isOpen: boolean;
  cardIndex: number | null;
  side: "frontImage" | "backImage" | null;
};

function createEmptyCard(): ArenaFlashcardCardInput {
  return {
    front: "",
    back: "",
    frontImage: "",
    backImage: "",
  };
}

export function ArenaFlashcardEditorSheet({
  visible,
  deck,
  onClose,
  onSaved,
}: Props) {
  const isEditing = Boolean(deck?._id);
  const [title, setTitle] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [cards, setCards] = useState<ArenaFlashcardCardInput[]>([createEmptyCard()]);
  const [templateText, setTemplateText] = useState("");
  const [saving, setSaving] = useState(false);
  const [imgModal, setImgModal] = useState<ImageModalState>({
    isOpen: false,
    cardIndex: null,
    side: null,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState("Qidirish tugmasini bosing");

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (isEditing) {
      setTitle(String(deck?.title || "").slice(0, APP_LIMITS.flashcardTitleChars));
      setInputMode("manual");
      setCards(
        Array.isArray(deck?.cards) && deck.cards.length > 0
          ? deck.cards.map((card) => ({
              front: String(card.front || "").slice(0, APP_LIMITS.flashcardSideChars),
              back: String(card.back || "").slice(0, APP_LIMITS.flashcardSideChars),
              frontImage: String(card.frontImage || ""),
              backImage: String(card.backImage || ""),
            }))
          : [createEmptyCard()],
      );
      setTemplateText("");
    } else {
      setTitle("");
      setInputMode("manual");
      setCards([createEmptyCard()]);
      setTemplateText("");
    }

    setSaving(false);
    setImgModal({ isOpen: false, cardIndex: null, side: null });
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
    setSearchFeedback("Qidirish tugmasini bosing");
  }, [deck, isEditing, visible]);

  const handleAddCard = () => {
    if (cards.length >= APP_LIMITS.flashcardsPerDeck) {
      Alert.alert(
        "Limitga yetildi",
        `Maksimal ${APP_LIMITS.flashcardsPerDeck} ta so'z qo'shish mumkin.`,
      );
      return;
    }

    setCards((current) => [...current, createEmptyCard()]);
  };

  const handleRemoveCard = (index: number) => {
    setCards((current) =>
      current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current,
    );
  };

  const handleCardChange = (
    index: number,
    field: keyof ArenaFlashcardCardInput,
    value: string,
  ) => {
    setCards((current) =>
      current.map((card, itemIndex) =>
        itemIndex === index
          ? {
              ...card,
              [field]:
                field === "front" || field === "back"
                  ? value.slice(0, APP_LIMITS.flashcardSideChars)
                  : value,
            }
          : card,
      ),
    );
  };

  const openImageModal = (cardIndex: number, side: "frontImage" | "backImage") => {
    const querySuggest =
      side === "frontImage"
        ? String(cards[cardIndex]?.front || "")
        : String(cards[cardIndex]?.back || "");

    setImgModal({ isOpen: true, cardIndex, side });
    setSearchQuery(querySuggest);
    setSearchResults([]);
    setSearchFeedback("Qidirish tugmasini bosing");
  };

  const closeImageModal = () => {
    setImgModal({ isOpen: false, cardIndex: null, side: null });
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
    setSearchFeedback("Qidirish tugmasini bosing");
  };

  const handleSearchImages = async () => {
    if (!searchQuery.trim() || isSearching) {
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    setSearchFeedback("Rasmlar qidirilmoqda...");

    try {
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        origin: "*",
        generator: "search",
        gsrsearch: searchQuery.trim(),
        gsrnamespace: "6",
        gsrlimit: "9",
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: "320",
        iiurlheight: "240",
      });

      const response = await fetch(
        `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
      );

      if (!response.ok) {
        throw new Error("Image search request failed");
      }

      const data = await response.json();
      const pages = Object.values((data as { query?: { pages?: Record<string, any> } })?.query?.pages || {});
      const results = pages
        .map(
          (page) =>
            page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || "",
        )
        .filter(Boolean)
        .slice(0, 9) as string[];

      setSearchResults(results);
      setSearchFeedback(results.length ? "" : "Mos rasm topilmadi");
    } catch (error) {
      console.error("Image search error:", error);
      setSearchResults([]);
      setSearchFeedback("Rasm qidirib bo'lmadi");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectImage = (url: string) => {
    if (imgModal.cardIndex === null || !imgModal.side) {
      return;
    }

    handleCardChange(imgModal.cardIndex, imgModal.side, url);
    closeImageModal();
  };

  const parseTemplate = (): ArenaFlashcardCardInput[] => {
    if (!templateText.trim()) {
      return [];
    }

    return templateText
      .split(";")
      .filter((block) => block.trim())
      .map((block) => {
        const commaIndex = block.indexOf(",");
        if (commaIndex < 0) {
          return null;
        }

        const front = block.substring(0, commaIndex).trim();
        const back = block.substring(commaIndex + 1).trim();

        if (!front || !back) {
          return null;
        }

        return {
          front: front.slice(0, APP_LIMITS.flashcardSideChars),
          back: back.slice(0, APP_LIMITS.flashcardSideChars),
          frontImage: "",
          backImage: "",
        };
      })
      .filter(Boolean) as ArenaFlashcardCardInput[];
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Tekshirib chiqing", "Lug'at sarlavhasini kiriting");
      return;
    }

    const finalCards =
      inputMode === "manual"
        ? cards
            .map((card) => ({
              front: card.front.trim(),
              back: card.back.trim(),
              frontImage: String(card.frontImage || "").trim(),
              backImage: String(card.backImage || "").trim(),
            }))
            .filter((card) => card.front && card.back)
        : parseTemplate();

    if (!finalCards.length) {
      Alert.alert("Tekshirib chiqing", "Kamida bitta to'g'ri karta kiriting");
      return;
    }

    if (finalCards.length > APP_LIMITS.flashcardsPerDeck) {
      Alert.alert(
        "Limitga yetildi",
        `Maksimal ${APP_LIMITS.flashcardsPerDeck} ta so'z qo'shish mumkin.`,
      );
      return;
    }

    const payload: ArenaFlashcardMutationPayload = {
      title: title.trim(),
      cards: finalCards,
    };

    setSaving(true);
    try {
      if (isEditing && deck?._id) {
        await arenaApi.updateFlashcardDeck(String(deck._id), payload);
      } else {
        await arenaApi.createFlashcardDeck(payload);
      }

      await Promise.resolve(onSaved());
      onClose();
    } catch (error) {
      Alert.alert(
        isEditing ? "Lug'at yangilanmadi" : "Lug'at yaratilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <View style={styles.footer}>
      <Pressable style={styles.footerSecondaryButton} onPress={onClose}>
        <Text style={styles.footerSecondaryButtonText}>Bekor qilish</Text>
      </Pressable>
      <Pressable
        style={[styles.footerPrimaryButton, saving && styles.footerButtonDisabled]}
        disabled={saving}
        onPress={() => void handleSave()}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.footerPrimaryButtonText}>
            {isEditing ? "O'zgarishlarni saqlash" : "Saqlash"}
          </Text>
        )}
      </Pressable>
    </View>
  );

  const overlay = imgModal.isOpen ? (
    <View style={styles.searchOverlay}>
      <Pressable style={styles.searchBackdrop} onPress={closeImageModal} />
      <View style={styles.searchModalContent}>
        <View style={styles.searchHeader}>
          <Text style={styles.searchTitle}>Rasm Qidirish</Text>
          <Pressable style={styles.searchCloseButton} onPress={closeImageModal}>
            <X size={18} color={Colors.mutedText} />
          </Pressable>
        </View>

        <View style={styles.searchForm}>
          <View style={styles.searchInputRow}>
            <Search size={16} color={Colors.subtleText} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Rasm qidirish uchun so'z yozing..."
              placeholderTextColor={Colors.subtleText}
              autoFocus
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={() => void handleSearchImages()}
            />
          </View>
          <Pressable
            style={[
              styles.searchSubmitButton,
              (!searchQuery.trim() || isSearching) && styles.searchSubmitButtonDisabled,
            ]}
            disabled={!searchQuery.trim() || isSearching}
            onPress={() => void handleSearchImages()}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Search size={18} color="#fff" />
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.searchResultsScroll}
          contentContainerStyle={styles.searchResultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {searchResults.length === 0 ? (
            <View style={styles.searchEmptyState}>
              <Text style={styles.searchEmptyText}>{searchFeedback}</Text>
            </View>
          ) : (
            <View style={styles.imageGrid}>
              {searchResults.map((url, index) => (
                <Pressable
                  key={`${url}-${index}`}
                  style={styles.imageGridItem}
                  onPress={() => handleSelectImage(url)}
                >
                  <Image source={{ uri: url }} style={styles.imageGridImage} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  ) : null;

  return (
    <DraggableBottomSheet
      visible={visible}
      title={isEditing ? "Lug'atni Tahrirlash" : "Yangi Lug'at (Flashcards)"}
      onClose={onClose}
      footer={footer}
      overlay={overlay}
      minHeight={680}
      initialHeightRatio={0.92}
      maxHeightRatio={0.97}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formGroup}>
          <Text style={styles.label}>To'plam nomi</Text>
          <TextInput
            placeholder="Masalan: Ingliz tili - 1-dars"
            placeholderTextColor={Colors.subtleText}
            value={title}
            onChangeText={(value) => setTitle(value.slice(0, APP_LIMITS.flashcardTitleChars))}
            style={styles.input}
          />
        </View>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, inputMode === "manual" && styles.tabActive]}
            onPress={() => setInputMode("manual")}
          >
            <Text style={[styles.tabText, inputMode === "manual" && styles.tabTextActive]}>
              Qo'lda kiritish
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, inputMode === "template" && styles.tabActive]}
            onPress={() => setInputMode("template")}
          >
            <Text style={[styles.tabText, inputMode === "template" && styles.tabTextActive]}>
              Andaza (Shablon)
            </Text>
          </Pressable>
        </View>

        {inputMode === "manual" ? (
          <>
            <View style={styles.cardList}>
              {cards.map((card, index) => (
                <View key={`flashcard-card-${index}`} style={styles.cardItem}>
                  <View style={styles.cardInputs}>
                    <View style={styles.inputRow}>
                      {card.frontImage ? (
                        <Image source={{ uri: card.frontImage }} style={styles.miniThumb} />
                      ) : null}
                      <TextInput
                        placeholder={`So'z (front) ${index + 1}`}
                        placeholderTextColor={Colors.subtleText}
                        value={card.front}
                        onChangeText={(value) => handleCardChange(index, "front", value)}
                        style={styles.flexInput}
                      />
                      <Pressable
                        style={styles.imageButton}
                        onPress={() => openImageModal(index, "frontImage")}
                      >
                        <ImageIcon size={16} color={Colors.mutedText} />
                      </Pressable>
                    </View>

                    <View style={styles.inputRow}>
                      {card.backImage ? (
                        <Image source={{ uri: card.backImage }} style={styles.miniThumb} />
                      ) : null}
                      <TextInput
                        placeholder={`Ma'nosi (back) ${index + 1}`}
                        placeholderTextColor={Colors.subtleText}
                        value={card.back}
                        onChangeText={(value) => handleCardChange(index, "back", value)}
                        style={styles.flexInput}
                      />
                      <Pressable
                        style={styles.imageButton}
                        onPress={() => openImageModal(index, "backImage")}
                      >
                        <ImageIcon size={16} color={Colors.mutedText} />
                      </Pressable>
                    </View>
                  </View>

                  {cards.length > 1 ? (
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => handleRemoveCard(index)}
                    >
                      <Trash2 size={18} color={Colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>

            <Pressable
              style={[
                styles.addCardButton,
                cards.length >= APP_LIMITS.flashcardsPerDeck && styles.addCardButtonDisabled,
              ]}
              disabled={cards.length >= APP_LIMITS.flashcardsPerDeck}
              onPress={handleAddCard}
            >
              <Plus
                size={18}
                color={
                  cards.length >= APP_LIMITS.flashcardsPerDeck ? Colors.subtleText : Colors.primary
                }
              />
              <Text
                style={[
                  styles.addCardButtonText,
                  cards.length >= APP_LIMITS.flashcardsPerDeck &&
                    styles.addCardButtonTextDisabled,
                ]}
              >
                {cards.length >= APP_LIMITS.flashcardsPerDeck
                  ? `Limitga yetildi (${APP_LIMITS.flashcardsPerDeck}/${APP_LIMITS.flashcardsPerDeck})`
                  : "Yangi so'z qo'shish"}
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Shablon matni</Text>
            <TextInput
              placeholder="Apple,Olma;Book,Kitob;"
              placeholderTextColor={Colors.subtleText}
              value={templateText}
              onChangeText={setTemplateText}
              multiline
              style={styles.templateInput}
            />
            <Text style={styles.helperText}>
              So'z va uning ma'nosini vergul (`,`) bilan ajrating. Har bir so'z juftligini
              nuqtali-vergul (`;`) bilan ajrating.
            </Text>
            <View style={styles.preBlock}>
              <Text style={styles.preBlockText}>Apple,Olma;</Text>
              <Text style={styles.preBlockText}>Book,Kitob;</Text>
              <Text style={styles.preBlockText}>Car,Mashina;</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 16,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    width: "100%",
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    color: Colors.text,
    fontSize: 16,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#fff",
  },
  cardList: {
    gap: 16,
    marginBottom: 24,
  },
  cardItem: {
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardInputs: {
    flex: 1,
    gap: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  flexInput: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 8,
    backgroundColor: "transparent",
    color: Colors.text,
    fontSize: 15,
    minHeight: 36,
  },
  miniThumb: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  imageButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    padding: 8,
    borderRadius: 4,
  },
  addCardButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addCardButtonDisabled: {
    borderColor: Colors.border,
  },
  addCardButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  addCardButtonTextDisabled: {
    color: Colors.subtleText,
  },
  templateInput: {
    width: "100%",
    height: 200,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    color: Colors.text,
    fontSize: 15,
    textAlignVertical: "top",
    fontFamily: "Courier",
  },
  helperText: {
    fontSize: 13,
    color: Colors.mutedText,
    lineHeight: 18,
  },
  preBlock: {
    backgroundColor: "#111",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  preBlockText: {
    color: "#ddd",
    fontSize: 13,
    fontFamily: "Courier",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  footerSecondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  footerSecondaryButtonText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  footerPrimaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  footerPrimaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  footerButtonDisabled: {
    opacity: 0.7,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  searchBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  searchModalContent: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "82%",
    borderRadius: 12,
    padding: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  searchTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  searchCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  searchForm: {
    flexDirection: "row",
    gap: 8,
  },
  searchInputRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 0,
    paddingVertical: 6,
    backgroundColor: "transparent",
    color: Colors.text,
    fontSize: 15,
  },
  searchSubmitButton: {
    width: 46,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchSubmitButtonDisabled: {
    opacity: 0.6,
  },
  searchResultsScroll: {
    flexGrow: 0,
  },
  searchResultsContent: {
    minHeight: 180,
  },
  searchEmptyState: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  searchEmptyText: {
    color: Colors.mutedText,
    fontSize: 14,
    textAlign: "center",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  imageGridItem: {
    width: "31.3%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.surfaceMuted,
  },
  imageGridImage: {
    width: "100%",
    height: "100%",
  },
});
