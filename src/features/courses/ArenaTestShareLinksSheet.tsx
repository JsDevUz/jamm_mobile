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
import { Copy, Link2, Trash2 } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { TextInput } from "../../components/TextInput";
import { APP_BASE_URL } from "../../config/env";
import { arenaApi } from "../../lib/api";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { ArenaTestPayload, ArenaTestShareLink } from "../../types/arena";

type Props = {
  visible: boolean;
  test: ArenaTestPayload | null;
  onClose: () => void;
};

function formatDate(value?: string) {
  if (!value) {
    return "Sana noma'lum";
  }

  return new Date(value).toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ArenaTestShareLinksSheet({ visible, test, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const isPremium =
    user?.premiumStatus === "premium" || user?.premiumStatus === "active";
  const shareLimit = isPremium ? 4 : 2;
  const [mode, setMode] = useState<"persist" | "ephemeral">("persist");
  const [groupName, setGroupName] = useState("");
  const [showResults, setShowResults] = useState(true);
  const [timeLimit, setTimeLimit] = useState("0");
  const [creating, setCreating] = useState(false);
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);

  const linksQuery = useQuery<ArenaTestShareLink[]>({
    queryKey: ["arena-test-share-links", test?._id || "unknown"],
    queryFn: () =>
      arenaApi.fetchTestShareLinks(String(test?._id || "")) as Promise<ArenaTestShareLink[]>,
    enabled: visible && Boolean(test?._id),
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!visible) {
      return;
    }

    setMode("persist");
    setGroupName("");
    setShowResults(true);
    setTimeLimit("0");
  }, [test?._id, visible]);

  const links = useMemo(
    () => (Array.isArray(linksQuery.data) ? linksQuery.data : []),
    [linksQuery.data],
  );

  const buildUrl = (shortCode?: string) =>
    `${APP_BASE_URL}/arena/quiz-link/${String(shortCode || "").trim()}`;

  const handleCopyLink = async (shortCode?: string) => {
    await Clipboard.setStringAsync(buildUrl(shortCode));
    await Haptics.selectionAsync();
    Alert.alert("Nusxalandi", "Test havolasi clipboard'ga saqlandi.");
  };

  const handleCreate = async () => {
    if (!test?._id) {
      return;
    }

    if (links.length >= shareLimit) {
      Alert.alert("Limitga yetildi", `Bu test uchun maksimal ${shareLimit} ta havola yaratish mumkin.`);
      return;
    }

    if (mode === "persist" && !groupName.trim()) {
      Alert.alert("Guruh nomi kerak", "Saqlanadigan havola uchun guruh nomini kiriting.");
      return;
    }

    setCreating(true);
    try {
      const created = (await arenaApi.createTestShareLink(test._id, {
        persistResults: mode !== "ephemeral",
        groupName: mode === "persist" ? groupName.trim() : "",
        showResults,
        timeLimit: Number(timeLimit) || 0,
      })) as ArenaTestShareLink;
      await linksQuery.refetch();
      await handleCopyLink(created.shortCode);
      setMode("persist");
      setGroupName("");
      setShowResults(true);
      setTimeLimit("0");
    } catch (error) {
      Alert.alert(
        "Havola yaratilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setCreating(false);
    }
  };

  const requestDelete = (shareLink: ArenaTestShareLink) => {
    if (!test?._id || !shareLink._id) {
      return;
    }

    Alert.alert("Havolani o'chirasizmi?", "Bu qisqa havola bekor qilinadi.", [
      {
        text: "Bekor qilish",
        style: "cancel",
      },
      {
        text: "O'chirish",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setDeletingLinkId(String(shareLink._id));
            try {
              await arenaApi.deleteTestShareLink(test._id || "", String(shareLink._id));
              await linksQuery.refetch();
            } catch (error) {
              Alert.alert(
                "Havola o'chirilmadi",
                error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
              );
            } finally {
              setDeletingLinkId(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <DraggableBottomSheet
      visible={visible}
      title="Havola yaratish"
      onClose={onClose}
      minHeight={560}
      initialHeightRatio={0.84}
      maxHeightRatio={0.95}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 20 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Limit</Text>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>
              {links.length}/{shareLimit}
            </Text>
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Havola turi</Text>
          <View style={styles.segmentedRow}>
            <Pressable
              style={[styles.segmentButton, mode === "persist" && styles.segmentButtonActive]}
              onPress={() => setMode("persist")}
            >
              <Text
                style={[
                  styles.segmentTitle,
                  mode === "persist" && styles.segmentTitleActive,
                ]}
              >
                Saqlanadigan
              </Text>
              <Text style={styles.segmentHint}>Natijalar history’da saqlanadi</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, mode === "ephemeral" && styles.segmentButtonActive]}
              onPress={() => setMode("ephemeral")}
            >
              <Text
                style={[
                  styles.segmentTitle,
                  mode === "ephemeral" && styles.segmentTitleActive,
                ]}
              >
                Bir martalik
              </Text>
              <Text style={styles.segmentHint}>Natija history’da saqlanmaydi</Text>
            </Pressable>
          </View>
        </View>

        {mode === "persist" ? (
          <View style={styles.group}>
            <Text style={styles.label}>Guruh nomi</Text>
            <TextInput
              value={groupName}
              onChangeText={(value) => setGroupName(value.slice(0, 40))}
              placeholder="Masalan: 9A"
              placeholderTextColor={Colors.subtleText}
              style={styles.input}
            />
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={styles.label}>Natijani ko'rsatish</Text>
          <View style={styles.segmentedRow}>
            <Pressable
              style={[styles.segmentButton, showResults && styles.segmentButtonActive]}
              onPress={() => setShowResults(true)}
            >
              <Text
                style={[
                  styles.segmentTitle,
                  showResults && styles.segmentTitleActive,
                ]}
              >
                Ko'rsatish
              </Text>
              <Text style={styles.segmentHint}>Foydalanuvchi yakunda natijani ko'radi</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, !showResults && styles.segmentButtonActive]}
              onPress={() => setShowResults(false)}
            >
              <Text
                style={[
                  styles.segmentTitle,
                  !showResults && styles.segmentTitleActive,
                ]}
              >
                Yashirish
              </Text>
              <Text style={styles.segmentHint}>Faqat siz history’da ko'rasiz</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Vaqt limiti</Text>
          <TextInput
            value={timeLimit}
            onChangeText={(value) => setTimeLimit(value.replace(/[^0-9]/g, "").slice(0, 3))}
            placeholder="0"
            placeholderTextColor={Colors.subtleText}
            keyboardType="number-pad"
            style={styles.input}
          />
          <Text style={styles.hint}>0 bo'lsa cheklanmagan, aks holda minut bilan.</Text>
        </View>

        <Pressable
          style={[styles.createButton, creating && styles.disabledButton]}
          disabled={creating || links.length >= shareLimit}
          onPress={() => void handleCreate()}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Link2 size={15} color="#fff" />
              <Text style={styles.createButtonText}>Havola yaratish</Text>
            </>
          )}
        </Pressable>

        <View style={styles.listGroup}>
          <Text style={styles.label}>Avvalgi havolalar</Text>

          {linksQuery.isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : linksQuery.isError ? (
            <View style={styles.centerState}>
              <Text style={styles.hint}>Havolalar yuklanmadi.</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => void linksQuery.refetch()}
              >
                <Text style={styles.retryButtonText}>Qayta yuklash</Text>
              </Pressable>
            </View>
          ) : links.length === 0 ? (
            <Text style={styles.hint}>Bu test uchun hali havola yaratilmagan.</Text>
          ) : (
            <View style={styles.linksList}>
              {links.map((item) => (
                <View key={item._id || item.shortCode} style={styles.linkCard}>
                  <View style={styles.linkTop}>
                    <View style={styles.linkCopy}>
                      <Text style={styles.linkTitle}>
                        {item.persistResults
                          ? item.groupName || "Saqlanadigan havola"
                          : "Bir martalik havola"}
                      </Text>
                      <Text style={styles.linkMeta}>{formatDate(item.createdAt)}</Text>
                    </View>

                    <View style={styles.linkActions}>
                      <Pressable
                        style={styles.iconButton}
                        onPress={() => void handleCopyLink(item.shortCode)}
                      >
                        <Copy size={14} color={Colors.text} />
                      </Pressable>
                      <Pressable
                        style={[styles.iconButton, styles.iconButtonDanger]}
                        disabled={deletingLinkId === item._id}
                        onPress={() => requestDelete(item)}
                      >
                        {deletingLinkId === item._id ? (
                          <ActivityIndicator size="small" color={Colors.danger} />
                        ) : (
                          <Trash2 size={14} color={Colors.danger} />
                        )}
                      </Pressable>
                    </View>
                  </View>

                  <Text style={styles.shortCodeText}>{buildUrl(item.shortCode)}</Text>
                  <Text style={styles.linkMeta}>
                    Natija: {item.showResults ? "ko'rsatiladi" : "yashiriladi"} • Vaqt:{" "}
                    {item.timeLimit ? `${item.timeLimit} minut` : "cheklanmagan"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  metaLabel: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  metaPill: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  metaPillText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  group: {
    gap: 8,
  },
  listGroup: {
    gap: 10,
  },
  label: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  segmentedRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 12,
    gap: 4,
  },
  segmentButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  segmentTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  segmentTitleActive: {
    color: Colors.primary,
  },
  segmentHint: {
    color: Colors.mutedText,
    fontSize: 11,
    lineHeight: 16,
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
  hint: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  createButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  centerState: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  retryButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  linksList: {
    gap: 10,
  },
  linkCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 12,
    gap: 8,
  },
  linkTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  linkCopy: {
    flex: 1,
    gap: 4,
  },
  linkTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  linkMeta: {
    color: Colors.mutedText,
    fontSize: 11,
    lineHeight: 16,
  },
  linkActions: {
    flexDirection: "row",
    gap: 6,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDanger: {
    backgroundColor: "rgba(240, 71, 71, 0.08)",
  },
  shortCodeText: {
    color: Colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
});
