import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Lock, Users } from "lucide-react-native";
import { Avatar } from "../../components/Avatar";
import { chatsApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import { Colors } from "../../theme/colors";
import { getEntityId } from "../../utils/chat";

type Props = NativeStackScreenProps<RootStackParamList, "GroupPreview">;

export function GroupPreviewScreen({ navigation, route }: Props) {
  const queryClient = useQueryClient();
  const identifier = String(route.params.identifier || "").trim();

  const previewQuery = useQuery({
    queryKey: ["group-preview", identifier],
    queryFn: () => chatsApi.previewGroupByLink(identifier),
    enabled: Boolean(identifier),
  });

  const joinMutation = useMutation({
    mutationFn: () => chatsApi.joinGroupByLink(identifier),
    onSuccess: async (chat) => {
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
      navigation.replace("ChatRoom", {
        chatId: getEntityId(chat),
        title: String(chat.name || previewQuery.data?.name || "Guruh"),
        isGroup: true,
      });
    },
    onError: (error) => {
      Alert.alert(
        "Qo'shilib bo'lmadi",
        error instanceof Error ? error.message : "Guruhga qo'shilishda xatolik yuz berdi.",
      );
    },
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Guruh preview</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <View style={styles.content}>
        {previewQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.helperText}>Guruh yuklanmoqda...</Text>
          </View>
        ) : previewQuery.isError || !previewQuery.data ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Guruh topilmadi</Text>
            <Text style={styles.helperText}>
              {previewQuery.error instanceof Error
                ? previewQuery.error.message
                : "Bu havola uchun guruh topilmadi."}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.previewScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <View style={styles.heroWrap}>
                <Avatar
                  label={previewQuery.data.name || "G"}
                  uri={previewQuery.data.avatar || undefined}
                  size={96}
                />
                <View style={styles.heroText}>
                  <Text style={styles.eyebrow}>Taklif orqali guruh</Text>
                  <Text style={styles.title}>{previewQuery.data.name || "Nomsiz guruh"}</Text>
                  <Text style={styles.statusText}>Siz ushbu guruh a'zosi emassiz</Text>
                </View>
              </View>

              {previewQuery.data.description ? (
                <Text style={styles.description}>{previewQuery.data.description}</Text>
              ) : null}

              <View style={styles.metaRow}>
                <View style={styles.metaBadge}>
                  <Users size={15} color={Colors.primary} />
                  <Text style={styles.metaText}>
                    {Number(previewQuery.data.memberCount || 0)} a'zo
                  </Text>
                </View>
                <View style={styles.metaBadge}>
                  <Lock size={15} color={Colors.primary} />
                  <Text style={styles.metaText}>Link orqali qo'shilish</Text>
                </View>
              </View>

              <View style={styles.linkCard}>
                <Text style={styles.linkLabel}>Havola</Text>
                <Text style={styles.linkValue} numberOfLines={1}>
                  {previewQuery.data.privateurl || identifier}
                </Text>
              </View>

              <Pressable
                style={[styles.joinButton, joinMutation.isPending && styles.joinButtonDisabled]}
                disabled={joinMutation.isPending}
                onPress={() => joinMutation.mutate()}
              >
                {joinMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.joinButtonText}>Guruhga qo'shilish</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  backButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  previewScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  centerState: {
    alignItems: "center",
    gap: 12,
  },
  helperText: {
    color: Colors.mutedText,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 24,
    gap: 18,
  },
  heroWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  heroText: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  statusText: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "700",
  },
  description: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  metaRow: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  metaBadge: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surfaceMuted,
  },
  linkCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  linkLabel: {
    color: Colors.subtleText,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  linkValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  metaText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  joinButton: {
    marginTop: 8,
    width: "100%",
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  joinButtonDisabled: {
    opacity: 0.7,
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
