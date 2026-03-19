import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Link2,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
} from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArenaTestEditorSheet } from "./ArenaTestEditorSheet";
import { ArenaTestResultsSheet } from "./ArenaTestResultsSheet";
import { ArenaTestShareLinksSheet } from "./ArenaTestShareLinksSheet";
import { useI18n } from "../../i18n";
import { arenaApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { ArenaTestPayload, ArenaTestsResponse } from "../../types/arena";
import { APP_LIMITS, getTierLimit } from "../../constants/appLimits";

type Props = NativeStackScreenProps<RootStackParamList, "ArenaQuizList">;
type TestMenuState = {
  test: ArenaTestPayload;
  x: number;
  y: number;
  width: number;
  height: number;
};

type EditorState = {
  testId: string | null;
};

const FLOATING_MENU_WIDTH = 184;
const FLOATING_MENU_HEIGHT = 176;

function getOwnerName(test: ArenaTestPayload) {
  const createdBy = test.createdBy;

  if (typeof createdBy === "string" && createdBy.trim()) {
    return createdBy;
  }

  if (!createdBy || typeof createdBy === "string") {
    return "Siz";
  }

  return (
    createdBy.nickname ||
    createdBy.name ||
    createdBy.username ||
    "Siz"
  );
}

export function ArenaQuizListScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const user = useAuthStore((state) => state.user);
  const testLimit = getTierLimit(APP_LIMITS.testsCreated, user?.premiumStatus);
  const menuButtonRefs = useRef<Record<string, View | null>>({});
  const [menuState, setMenuState] = useState<TestMenuState | null>(null);
  const [resultsTest, setResultsTest] = useState<ArenaTestPayload | null>(null);
  const [shareTest, setShareTest] = useState<ArenaTestPayload | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [deletingTestId, setDeletingTestId] = useState<string | null>(null);

  const testsQuery = useQuery<ArenaTestsResponse>({
    queryKey: ["arena-tests", "mine", "list-screen", user?._id || user?.id || "guest"],
    queryFn: () => arenaApi.fetchMyTests(1, 20),
  });

  const tests = useMemo(
    () => (Array.isArray(testsQuery.data?.data) ? testsQuery.data.data : []),
    [testsQuery.data?.data],
  );

  const handleBack = useCallback(() => {
    navigation.navigate("MainTabs", {
      screen: "Courses",
      params: { viewMode: "arena" },
    });
  }, [navigation]);

  const activeMenuTest = menuState?.test || null;
  const menuDeleting = deletingTestId === String(activeMenuTest?._id || "");
  const menuLeft = useMemo(() => {
    if (!menuState) {
      return 12;
    }

    const preferredLeft = menuState.x + menuState.width - FLOATING_MENU_WIDTH;
    return Math.max(12, Math.min(preferredLeft, screenWidth - FLOATING_MENU_WIDTH - 12));
  }, [menuState, screenWidth]);

  const menuTop = useMemo(() => {
    if (!menuState) {
      return 12;
    }

    const belowTop = menuState.y + menuState.height + 8;
    if (belowTop + FLOATING_MENU_HEIGHT <= screenHeight - 12) {
      return belowTop;
    }

    return Math.max(12, menuState.y - FLOATING_MENU_HEIGHT - 8);
  }, [menuState, screenHeight]);

  const handleOpenTest = (item: ArenaTestPayload) => {
    if (!item._id) {
      Alert.alert(t("arena.testsList.openFailedTitle"), t("arena.testsList.openFailedDescription"));
      return;
    }

    navigation.navigate("ArenaTestPlayer", {
      testId: String(item._id),
      test: item,
    });
  };

  const handleDeleteTest = (item: ArenaTestPayload) => {
    if (!item._id || deletingTestId) {
      return;
    }

    Alert.alert(
      t("arena.testsList.deleteTitle"),
      t("arena.testsList.deleteDescription"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingTestId(String(item._id));
              try {
                await arenaApi.deleteTest(String(item._id));
                setMenuState(null);
                if (resultsTest?._id === item._id) {
                  setResultsTest(null);
                }
                if (shareTest?._id === item._id) {
                  setShareTest(null);
                }
                if (editorState?.testId === item._id) {
                  setEditorState(null);
                }
                await testsQuery.refetch();
              } catch (error) {
                Alert.alert(
                  t("arena.testsList.deleteFailed"),
                  error instanceof Error
                    ? error.message
                    : "Noma'lum xatolik yuz berdi.",
                );
              } finally {
                setDeletingTestId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const openMenu = (item: ArenaTestPayload) => {
    const testId = String(item._id || "");
    if (!testId) {
      return;
    }

    if (menuState?.test._id === item._id) {
      setMenuState(null);
      return;
    }

    const target = menuButtonRefs.current[testId];
    if (!target) {
      setMenuState({
        test: item,
        x: screenWidth - FLOATING_MENU_WIDTH - 12,
        y: 96,
        width: 34,
        height: 34,
      });
      return;
    }

    target.measureInWindow((x, y, width, height) => {
      setMenuState({
        test: item,
        x,
        y,
        width,
        height,
      });
    });
  };

  const handleOpenCreate = () => {
    if (tests.length >= testLimit) {
      Alert.alert(
        t("arena.testsList.limitTitle"),
        t("arena.testsList.limitDescription", { count: testLimit }),
      );
      return;
    }

    setEditorState({ testId: null });
  };

  const renderCard = ({ item }: { item: ArenaTestPayload }) => {
    const title = item.title?.trim() || t("arena.testsList.untitled");
    const description = item.description?.trim() || t("arena.testsList.noDescription");
    const owner = getOwnerName(item);
    const questionCount = item.questions?.length || 0;
    const testId = String(item._id || "");
    const deleting = deletingTestId === testId;

    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          if (menuState?.test._id === item._id) {
            setMenuState(null);
            return;
          }

          setMenuState(null);
          handleOpenTest(item);
        }}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>{title}</Text>
          <View
            ref={(node) => {
              menuButtonRefs.current[testId] = node;
            }}
            collapsable={false}
            style={styles.menuWrap}
          >
            <Pressable
              style={styles.menuButton}
              onPress={(event) => {
                event.stopPropagation();
                openMenu(item);
              }}
            >
              <MoreHorizontal size={16} color={Colors.mutedText} />
            </Pressable>
          </View>
        </View>

        <Text style={styles.cardDescription}>{description}</Text>
        <Text style={styles.cardMeta}>Savollar soni: {questionCount}</Text>
        <Text style={styles.cardMeta}>Tuzuvchi: {owner}</Text>

        <View style={styles.cardHint}>
          <PlayCircle size={14} color={Colors.mutedText} />
          <Text style={styles.cardHintText}>Boshlash uchun kartani bosing</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSlot}>
            <Pressable style={styles.headerButton} onPress={handleBack}>
              <ArrowLeft size={20} color={Colors.text} />
            </Pressable>
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Testlar</Text>
          </View>

          <View style={[styles.headerSlot, styles.headerSlotEnd]}>
            <Pressable
              style={styles.headerButton}
              onPress={handleOpenCreate}
            >
              <Plus size={18} color={Colors.text} />
            </Pressable>
          </View>
        </View>

        {testsQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : testsQuery.isError ? (
          <View style={styles.centerState}>
            <Text style={styles.emptyTitle}>Testlar yuklanmadi</Text>
            <Text style={styles.emptyText}>
              Arena testlarini yana bir bor yuklab ko'ring.
            </Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => void testsQuery.refetch()}
            >
              <Text style={styles.retryButtonText}>Qayta yuklash</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={tests}
            keyExtractor={(item, index) => String(item._id || item.title || index)}
            renderItem={renderCard}
            extraData={`${menuState?.test._id || ""}:${deletingTestId || ""}`}
            refreshControl={
              <RefreshControl
                refreshing={testsQuery.isRefetching}
                onRefresh={() => {
                  setMenuState(null);
                  void testsQuery.refetch();
                }}
                tintColor={Colors.primary}
              />
            }
            onScrollBeginDrag={() => setMenuState(null)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centerState}>
                <BookOpen size={30} color={Colors.mutedText} />
                <Text style={styles.emptyTitle}>Testlar topilmadi</Text>
                <Text style={styles.emptyText}>
                  Frontda yaratgan testlaringiz shu yerda ko'rinadi.
                </Text>
              </View>
            }
          />
        )}

        <Modal
          visible={Boolean(activeMenuTest)}
          transparent
          animationType="none"
          onRequestClose={() => setMenuState(null)}
        >
          <View style={styles.menuModalRoot}>
            <Pressable style={styles.menuBackdrop} onPress={() => setMenuState(null)} />
            {activeMenuTest ? (
              <View
                style={[
                  styles.menuDropdownFloating,
                  {
                    left: menuLeft,
                    top: menuTop,
                  },
                ]}
              >
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuState(null);
                    setResultsTest(activeMenuTest);
                  }}
                >
                  <BarChart3 size={14} color={Colors.text} />
                  <Text style={styles.menuItemText}>Natijalar</Text>
                </Pressable>

                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuState(null);
                    setShareTest(activeMenuTest);
                  }}
                >
                  <Link2 size={14} color={Colors.text} />
                  <Text style={styles.menuItemText}>Havola yaratish</Text>
                </Pressable>

                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuState(null);
                    setEditorState({ testId: String(activeMenuTest._id || "") });
                  }}
                >
                  <Pencil size={14} color={Colors.text} />
                  <Text style={styles.menuItemText}>Tahrirlash</Text>
                </Pressable>

                <Pressable
                  style={[styles.menuItem, styles.menuItemDanger]}
                  disabled={menuDeleting}
                  onPress={() => {
                    setMenuState(null);
                    handleDeleteTest(activeMenuTest);
                  }}
                >
                  {menuDeleting ? (
                    <ActivityIndicator size="small" color={Colors.danger} />
                  ) : (
                    <Trash2 size={14} color={Colors.danger} />
                  )}
                  <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                    O'chirish
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </Modal>

        <ArenaTestResultsSheet
          visible={Boolean(resultsTest)}
          test={resultsTest}
          onClose={() => setResultsTest(null)}
        />
        <ArenaTestShareLinksSheet
          visible={Boolean(shareTest)}
          test={shareTest}
          onClose={() => setShareTest(null)}
        />
        <ArenaTestEditorSheet
          visible={Boolean(editorState)}
          testId={editorState?.testId ?? null}
          onClose={() => setEditorState(null)}
          onSaved={async () => {
            await testsQuery.refetch();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    gap: 8,
  },
  headerSlot: {
    width: 48,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerSlotEnd: {
    alignItems: "flex-end",
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  headerCount: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 28,
    gap: 16,
    flexGrow: 1,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 20,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  menuWrap: {
    position: "relative",
  },
  menuDropdown: {
    minWidth: FLOATING_MENU_WIDTH,
  },
  menuModalRoot: {
    flex: 1,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  menuDropdownFloating: {
    position: "absolute",
    minWidth: FLOATING_MENU_WIDTH,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    gap: 4,
  },
  menuItem: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "transparent",
  },
  menuItemDanger: {
    backgroundColor: "rgba(240, 71, 71, 0.08)",
  },
  menuItemText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  menuItemTextDanger: {
    color: Colors.danger,
  },
  cardDescription: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  cardMeta: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  cardHint: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardHintText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
