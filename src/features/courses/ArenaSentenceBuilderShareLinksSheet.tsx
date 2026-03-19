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
import * as Clipboard from "expo-clipboard";
import { Copy, Link2, Trash2 } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { TextInput } from "../../components/TextInput";
import { APP_LIMITS, getTierLimit } from "../../constants/appLimits";
import { APP_BASE_URL } from "../../config/env";
import { useI18n } from "../../i18n";
import { arenaApi } from "../../lib/api";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type {
  ArenaSentenceBuilderDeck,
  ArenaSentenceBuilderShareLink,
} from "../../types/arena";

type Props = {
  visible: boolean;
  deck: ArenaSentenceBuilderDeck | null;
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

export function ArenaSentenceBuilderShareLinksSheet({ visible, deck, onClose }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const shareLimit = getTierLimit(
    APP_LIMITS.sentenceBuilderShareLinksPerDeck,
    user?.premiumStatus,
  );
  const [mode, setMode] = useState<"persist" | "ephemeral">("persist");
  const [groupName, setGroupName] = useState("");
  const [showResults, setShowResults] = useState(true);
  const [timeLimit, setTimeLimit] = useState("0");
  const [creating, setCreating] = useState(false);
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);

  const linksQuery = useQuery<ArenaSentenceBuilderShareLink[]>({
    queryKey: ["arena-sentence-builder-share-links", deck?._id || "unknown"],
    queryFn: () =>
      arenaApi.fetchSentenceBuilderShareLinks(String(deck?._id || "")) as Promise<
        ArenaSentenceBuilderShareLink[]
      >,
    enabled: visible && Boolean(deck?._id),
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
  }, [deck?._id, visible]);

  const links = useMemo(
    () => (Array.isArray(linksQuery.data) ? linksQuery.data : []),
    [linksQuery.data],
  );

  const buildUrl = (shortCode?: string) =>
    `${APP_BASE_URL}/arena/sentence-builder/${String(shortCode || "").trim()}`;

  const handleCopyLink = async (shortCode?: string) => {
    await Clipboard.setStringAsync(buildUrl(shortCode));
    Alert.alert(t("arena.shareLinks.copiedTitle"), t("arena.shareLinks.builderCopiedDescription"));
  };

  const handleCreate = async () => {
    if (!deck?._id) {
      return;
    }

    if (links.length >= shareLimit) {
      Alert.alert(t("arenaShared.shareLinks.limitReached"), t("arena.testsList.limitDescription", { count: shareLimit }));
      return;
    }

    if (mode === "persist" && !groupName.trim()) {
      Alert.alert(t("arena.shareLinks.groupRequiredTitle"), t("arena.shareLinks.groupRequiredDescription"));
      return;
    }

    setCreating(true);
    try {
      const created = await arenaApi.createSentenceBuilderShareLink(String(deck._id), {
        persistResults: mode !== "ephemeral",
        groupName: mode === "persist" ? groupName.trim() : "",
        showResults,
        timeLimit: Number(timeLimit) || 0,
      });
      await linksQuery.refetch();
      await handleCopyLink(created.shortCode);
      setMode("persist");
      setGroupName("");
      setShowResults(true);
      setTimeLimit("0");
    } catch (error) {
      Alert.alert(
        t("arena.shareLinks.createFailed"),
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    } finally {
      setCreating(false);
    }
  };

  const requestDelete = (shareLink: ArenaSentenceBuilderShareLink) => {
    if (!deck?._id || !shareLink._id) {
      return;
    }

    Alert.alert(t("arena.shareLinks.deleteTitle"), t("arena.shareLinks.deleteDescription"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            setDeletingLinkId(String(shareLink._id));
            try {
              await arenaApi.deleteSentenceBuilderShareLink(
                String(deck._id),
                String(shareLink._id),
              );
              await linksQuery.refetch();
            } catch (error) {
              Alert.alert(
                t("arena.shareLinks.deleteFailed"),
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
      title={t("arenaShared.shareLinks.create")}
      onClose={onClose}
      minHeight={560}
      initialHeightRatio={0.84}
      maxHeightRatio={0.95}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}
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
              <Text style={[styles.segmentTitle, mode === "persist" && styles.segmentTitleActive]}>
                Saqlanadigan
              </Text>
              <Text style={styles.segmentHint}>Natijalar history'da saqlanadi</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, mode === "ephemeral" && styles.segmentButtonActive]}
              onPress={() => setMode("ephemeral")}
            >
              <Text style={[styles.segmentTitle, mode === "ephemeral" && styles.segmentTitleActive]}>
                Bir martalik
              </Text>
              <Text style={styles.segmentHint}>Natija history'da saqlanmaydi</Text>
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
              <Text style={[styles.segmentTitle, showResults && styles.segmentTitleActive]}>
                Ko'rsatish
              </Text>
              <Text style={styles.segmentHint}>Foydalanuvchi yakunda natijani ko'radi</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, !showResults && styles.segmentButtonActive]}
              onPress={() => setShowResults(false)}
            >
              <Text style={[styles.segmentTitle, !showResults && styles.segmentTitleActive]}>
                Yashirish
              </Text>
              <Text style={styles.segmentHint}>Faqat siz history'da ko'rasiz</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Time limit</Text>
          <TextInput
            value={timeLimit}
            onChangeText={(value) => setTimeLimit(value.replace(/[^0-9]/g, "").slice(0, 3))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={Colors.subtleText}
            style={styles.input}
          />
          <Text style={styles.helperText}>0 bo'lsa cheksiz. Qiymat daqiqada olinadi.</Text>
        </View>

        <Pressable
          style={[styles.primaryButton, creating && styles.buttonDisabled]}
          onPress={() => void handleCreate()}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Link2 size={16} color="#fff" />
              <Text style={styles.primaryButtonText}>Yangi havola yaratish</Text>
            </>
          )}
        </Pressable>

        <View style={styles.linksSection}>
          <Text style={styles.label}>Mavjud havolalar</Text>
          {linksQuery.isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : links.length === 0 ? (
            <Text style={styles.emptyText}>Hozircha havola yo'q.</Text>
          ) : (
            links.map((item) => (
              <View key={String(item._id || item.shortCode)} style={styles.linkCard}>
                <View style={styles.linkCardHead}>
                  <Text style={styles.linkTitle}>
                    {item.groupName?.trim() || "Bir martalik havola"}
                  </Text>
                  <Text style={styles.linkMeta}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={styles.linkUrl} numberOfLines={2}>
                  {buildUrl(item.shortCode)}
                </Text>
                <View style={styles.linkBadges}>
                  <View style={styles.linkBadge}>
                    <Text style={styles.linkBadgeText}>
                      {item.persistResults !== false ? "Saqlanadi" : "Bir martalik"}
                    </Text>
                  </View>
                  <View style={styles.linkBadge}>
                    <Text style={styles.linkBadgeText}>
                      {item.showResults !== false ? "Natija ko'rinadi" : "Natija yashirin"}
                    </Text>
                  </View>
                </View>
                <View style={styles.linkActions}>
                  <Pressable
                    style={styles.inlineButton}
                    onPress={() => void handleCopyLink(item.shortCode)}
                  >
                    <Copy size={14} color={Colors.text} />
                    <Text style={styles.inlineButtonText}>Nusxalash</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.inlineButton, styles.inlineButtonDanger]}
                    onPress={() => requestDelete(item)}
                    disabled={deletingLinkId === String(item._id || "")}
                  >
                    {deletingLinkId === String(item._id || "") ? (
                      <ActivityIndicator size="small" color={Colors.danger} />
                    ) : (
                      <Trash2 size={14} color={Colors.danger} />
                    )}
                    <Text style={[styles.inlineButtonText, styles.inlineButtonTextDanger]}>
                      O'chirish
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaLabel: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  metaPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.primarySoft,
  },
  metaPillText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  group: {
    gap: 8,
  },
  label: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  segmentedRow: {
    flexDirection: "row",
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
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
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    minHeight: 48,
  },
  helperText: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linksSection: {
    gap: 10,
  },
  centerState: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
  linkCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 10,
  },
  linkCardHead: {
    gap: 2,
  },
  linkTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  linkMeta: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  linkUrl: {
    color: Colors.primary,
    fontSize: 13,
    lineHeight: 18,
  },
  linkBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  linkBadge: {
    borderRadius: 999,
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  linkBadgeText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },
  linkActions: {
    flexDirection: "row",
    gap: 10,
  },
  inlineButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  inlineButtonDanger: {
    borderColor: "rgba(239,68,68,0.2)",
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  inlineButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  inlineButtonTextDanger: {
    color: Colors.danger,
  },
});
