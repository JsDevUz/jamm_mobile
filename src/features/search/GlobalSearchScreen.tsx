import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowLeft, Search } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { TextInput } from "../../components/TextInput";
import { useI18n } from "../../i18n";
import { articlesApi, chatsApi, coursesApi, usersApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { ArticleSummary } from "../../types/articles";
import type { Course } from "../../types/courses";
import type { ChatSummary, User } from "../../types/entities";
import { getEntityId } from "../../utils/chat";

type Props = NativeStackScreenProps<RootStackParamList, "GlobalSearch">;
type SearchTabKey = "private" | "groups" | "articles" | "courses";

const SEARCH_TABS: Array<{ key: SearchTabKey }> = [
  { key: "private" },
  { key: "groups" },
  { key: "articles" },
  { key: "courses" },
];

const MIN_SEARCH_LENGTH = 1;

export function GlobalSearchScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<SearchTabKey>(route.params?.initialTab || "private");
  const [query, setQuery] = useState(route.params?.initialQuery || "");
  const [loading, setLoading] = useState(false);
  const [privateResults, setPrivateResults] = useState<User[]>([]);
  const [groupResults, setGroupResults] = useState<ChatSummary[]>([]);
  const [articleResults, setArticleResults] = useState<ArticleSummary[]>([]);
  const [courseResults, setCourseResults] = useState<Course[]>([]);
  const pagerRef = useRef<ScrollView>(null);
  const tabsScrollRef = useRef<ScrollView>(null);
  const pagerScrollX = useRef(new Animated.Value(0)).current;
  const [tabLayouts, setTabLayouts] = useState<
    Partial<Record<SearchTabKey, { x: number; width: number }>>
  >({});
  const currentIndexRef = useRef(
    Math.max(
      SEARCH_TABS.findIndex((tab) => tab.key === (route.params?.initialTab || "private")),
      0,
    ),
  );

  const normalizedQuery = query.trim();
  const tabIndicatorTranslateX = useMemo(() => {
    const layouts = SEARCH_TABS.map((tab) => tabLayouts[tab.key]).filter(Boolean);
    if (layouts.length !== SEARCH_TABS.length) {
      return 0;
    }

    return pagerScrollX.interpolate({
      inputRange: SEARCH_TABS.map((_, index) => screenWidth * index),
      outputRange: SEARCH_TABS.map((tab) => tabLayouts[tab.key]?.x || 0),
      extrapolate: "clamp",
    });
  }, [pagerScrollX, screenWidth, tabLayouts]);

  const tabIndicatorWidth = useMemo(() => {
    const layouts = SEARCH_TABS.map((tab) => tabLayouts[tab.key]).filter(Boolean);
    if (layouts.length !== SEARCH_TABS.length) {
      return 0;
    }

    return pagerScrollX.interpolate({
      inputRange: SEARCH_TABS.map((_, index) => screenWidth * index),
      outputRange: SEARCH_TABS.map((tab) => tabLayouts[tab.key]?.width || 0),
      extrapolate: "clamp",
    });
  }, [pagerScrollX, screenWidth, tabLayouts]);

  const getTabIndex = useCallback(
    (tabKey: SearchTabKey) => Math.max(SEARCH_TABS.findIndex((tab) => tab.key === tabKey), 0),
    [],
  );

  useEffect(() => {
    const nextInitialTab = route.params?.initialTab;
    if (nextInitialTab) {
      const nextIndex = getTabIndex(nextInitialTab);
      currentIndexRef.current = nextIndex;
      setActiveTab(nextInitialTab);
      requestAnimationFrame(() => {
        pagerRef.current?.scrollTo({
          x: nextIndex * screenWidth,
          animated: false,
        });
      });
    }
  }, [getTabIndex, route.params?.initialTab, screenWidth]);

  useEffect(() => {
    const nextInitialQuery = route.params?.initialQuery;
    if (typeof nextInitialQuery === "string") {
      setQuery(nextInitialQuery);
    }
  }, [route.params?.initialQuery]);

  useEffect(() => {
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({
        x: currentIndexRef.current * screenWidth,
        animated: false,
      });
    });
  }, [screenWidth]);

  useEffect(() => {
    let cancelled = false;

    if (normalizedQuery.length < MIN_SEARCH_LENGTH) {
      setLoading(false);
      setPrivateResults([]);
      setGroupResults([]);
      setArticleResults([]);
      setCourseResults([]);
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        if (activeTab === "private") {
          const results = await usersApi.searchGlobal(normalizedQuery);
          if (!cancelled) {
            setPrivateResults(results);
          }
          return;
        }

        if (activeTab === "groups") {
          const results = await chatsApi.searchGroups(normalizedQuery);
          if (!cancelled) {
            setGroupResults(results);
          }
          return;
        }

        if (activeTab === "articles") {
          const filtered = await articlesApi.searchArticles(normalizedQuery, 30);
          if (!cancelled) {
            setArticleResults(Array.isArray(filtered) ? filtered : []);
          }
          return;
        }

        const filtered = await coursesApi.searchCourses(normalizedQuery, 30);
        if (!cancelled) {
          setCourseResults(Array.isArray(filtered) ? filtered : []);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, normalizedQuery]);

  const handleOpenPrivateChat = useCallback(
    async (targetUser: User) => {
      const targetUserId = getEntityId(targetUser);
      const currentUserId = getEntityId(currentUser);
      if (!targetUserId) {
        return;
      }

      const chats = await chatsApi.fetchChats();
      const existingChat = chats.find((chat) => {
        if (chat.isGroup || !Array.isArray(chat.members)) {
          return false;
        }

        if (targetUserId === currentUserId) {
          return chat.isSavedMessages === true;
        }

        return (
          !chat.isSavedMessages &&
          chat.members.some((member) => getEntityId(member) === targetUserId)
        );
      });

      if (existingChat) {
        navigation.navigate("ChatRoom", {
          chatId: String(existingChat._id || existingChat.id || existingChat.urlSlug || ""),
          title:
            existingChat.name ||
            targetUser.nickname ||
            targetUser.username ||
            t("common.userFallback", { defaultValue: "Foydalanuvchi" }),
          isGroup: false,
        });
        return;
      }

      const chat = await chatsApi.createChat({
        isGroup: false,
        memberIds: [targetUserId],
      });

      navigation.navigate("ChatRoom", {
        chatId: String(chat._id || chat.id || chat.urlSlug || ""),
        title:
          targetUser.nickname ||
          targetUser.username ||
          t("common.userFallback", { defaultValue: "Foydalanuvchi" }),
        isGroup: false,
      });
    },
    [currentUser, navigation, t],
  );

  const handleOpenGroup = useCallback(
    (group: ChatSummary) => {
      navigation.navigate("ChatRoom", {
        chatId: String(group._id || group.id || group.urlSlug || ""),
        title: group.name || t("chatsSidebar.groupFallback", { defaultValue: "Guruh" }),
        isGroup: true,
      });
    },
    [navigation, t],
  );

  const getResultsForTab = useCallback(
    (tabKey: SearchTabKey) => {
      switch (tabKey) {
        case "private":
          return privateResults;
        case "groups":
          return groupResults;
        case "articles":
          return articleResults;
        case "courses":
          return courseResults;
        default:
          return [];
      }
    },
    [articleResults, courseResults, groupResults, privateResults],
  );

  const animateToTab = useCallback(
    (nextTab: SearchTabKey) => {
      const nextIndex = getTabIndex(nextTab);
      currentIndexRef.current = nextIndex;
      setActiveTab(nextTab);
      const layout = tabLayouts[nextTab];
      if (layout) {
        tabsScrollRef.current?.scrollTo({
          x: Math.max(layout.x - 16, 0),
          animated: true,
        });
      }
      pagerRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: true,
      });
    },
    [getTabIndex, screenWidth, tabLayouts],
  );

  const renderEmpty = useCallback(
    (tabKey: SearchTabKey) => {
      if (normalizedQuery.length < MIN_SEARCH_LENGTH) {
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {t("arenaShared.results.searchPlaceholder", { defaultValue: "Qidirish..." })}
            </Text>
            <Text style={styles.emptyDescription}>
              Ism, sarlavha yoki nom bo‘yicha qidiring.
            </Text>
          </View>
        );
      }

      if (activeTab === tabKey && loading) {
        return (
          <View style={styles.emptyState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        );
      }

      if (activeTab !== tabKey) {
        return <View style={styles.emptyState} />;
      }

      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Hech narsa topilmadi</Text>
          <Text style={styles.emptyDescription}>Boshqa so‘z bilan urinib ko‘ring.</Text>
        </View>
      );
    },
    [activeTab, loading, normalizedQuery.length, t],
  );

  const renderTabResults = useCallback(
    (tabKey: SearchTabKey) => {
      const tabResults = getResultsForTab(tabKey);
      if (tabResults.length === 0) {
        return renderEmpty(tabKey);
      }

      switch (tabKey) {
        case "private":
          return privateResults.map((user) => (
            <Pressable
              key={String(getEntityId(user) || user.username || Math.random())}
              style={styles.resultRow}
              onPress={() => void handleOpenPrivateChat(user)}
            >
              <Avatar
                label={user.nickname || user.username || "U"}
                uri={user.avatar}
                size={48}
                shape="circle"
              />
              <View style={styles.resultBody}>
                <Text style={styles.resultTitle}>
                  {user.nickname || user.username || "Foydalanuvchi"}
                </Text>
                <Text style={styles.resultSubtitle}>
                  @{user.username || "user"}
                </Text>
              </View>
            </Pressable>
          ));
        case "groups":
          return groupResults.map((group) => {
            const memberCount = Array.isArray(group.members) ? group.members.length : 0;

            return (
              <Pressable
                key={String(group._id || group.id || group.urlSlug || Math.random())}
                style={styles.resultRow}
                onPress={() => handleOpenGroup(group)}
              >
                <Avatar
                  label={group.name || "G"}
                  uri={group.avatar}
                  size={48}
                  shape="circle"
                  isGroup
                />
                <View style={styles.resultBody}>
                  <Text style={styles.resultTitle}>{group.name || "Guruh"}</Text>
                  <Text style={styles.resultSubtitle}>
                    {memberCount > 0 ? `${memberCount} a'zo` : "Guruh"}
                  </Text>
                </View>
              </Pressable>
            );
          });
        case "articles":
          return articleResults.map((article) => (
            <Pressable
              key={String(article._id || article.slug || Math.random())}
              style={styles.resultRow}
              onPress={() =>
                navigation.navigate("ArticleDetail", {
                  articleId: String(article.slug || article._id || ""),
                })
              }
            >
              <Avatar
                label={article.title || "A"}
                uri={article.coverImage}
                size={48}
              />
              <View style={styles.resultBody}>
                <Text style={styles.resultTitle}>{article.title || "Maqola"}</Text>
                <Text style={styles.resultSubtitle} numberOfLines={1}>
                  {article.excerpt || article.author?.nickname || article.author?.username || ""}
                </Text>
              </View>
            </Pressable>
          ));
        case "courses":
          return courseResults.map((course) => (
            <Pressable
              key={String(course._id || course.urlSlug || Math.random())}
              style={styles.resultRow}
              onPress={() =>
                navigation.navigate("CourseDetail", {
                  courseId: String(course.urlSlug || course._id || ""),
                })
              }
            >
              <Avatar
                label={course.name || "K"}
                uri={course.image}
                size={48}
              />
              <View style={styles.resultBody}>
                <Text style={styles.resultTitle}>{course.name || "Kurs"}</Text>
                <Text style={styles.resultSubtitle} numberOfLines={1}>
                  {course.description || ""}
                </Text>
              </View>
            </Pressable>
          ));
        default:
          return null;
      }
    },
    [
      articleResults,
      courseResults,
      getResultsForTab,
      groupResults,
      handleOpenGroup,
      handleOpenPrivateChat,
      navigation,
      privateResults,
      renderEmpty,
    ],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.searchHeader}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <ArrowLeft size={24} color={Colors.text} />
          </Pressable>
          <View style={styles.searchField}>
            <Search size={20} color={Colors.subtleText} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("arenaShared.results.searchPlaceholder", {
                defaultValue: "Qidirish...",
              })}
              placeholderTextColor={Colors.subtleText}
              style={styles.searchInput}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <ScrollView
          ref={tabsScrollRef}
          horizontal
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsRow}
          showsHorizontalScrollIndicator={false}
        >
          {Object.keys(tabLayouts).length === SEARCH_TABS.length ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tabIndicator,
                {
                  width: tabIndicatorWidth as any,
                  transform: [{ translateX: tabIndicatorTranslateX as any }],
                },
              ]}
            />
          ) : null}
          {SEARCH_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const label =
              tab.key === "private"
                ? t("chatsSidebar.tabs.private", { defaultValue: "Shaxsiy" })
                : tab.key === "groups"
                  ? t("chatsSidebar.tabs.groups", { defaultValue: "Guruhlar" })
                  : tab.key === "articles"
                    ? t("navigation.articles", { defaultValue: "Maqolalar" })
                    : t("navigation.courses", { defaultValue: "Kurslar" });

            return (
              <Pressable
                key={tab.key}
                style={styles.tabButton}
                onPress={() => animateToTab(tab.key)}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  setTabLayouts((current) => {
                    const previous = current[tab.key];
                    if (previous?.x === x && previous?.width === width) {
                      return current;
                    }

                    return {
                      ...current,
                      [tab.key]: { x, width },
                    };
                  });
                }}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.resultsPager}>
          <Animated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            bounces={false}
            directionalLockEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(
                event.nativeEvent.contentOffset.x / Math.max(screenWidth, 1),
              );
              const nextTab = SEARCH_TABS[nextIndex]?.key || "private";
              currentIndexRef.current = nextIndex;
              setActiveTab(nextTab);
              const layout = tabLayouts[nextTab];
              if (layout) {
                tabsScrollRef.current?.scrollTo({
                  x: Math.max(layout.x - 16, 0),
                  animated: true,
                });
              }
            }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: pagerScrollX } } }],
              { useNativeDriver: false },
            )}
            style={styles.resultsTrack}
          >
            {SEARCH_TABS.map((tab) => (
              <View key={tab.key} style={[styles.resultsPage, { width: screenWidth }]}>
                <ScrollView
                  style={styles.resultsScroll}
                  contentContainerStyle={styles.resultsContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {renderTabResults(tab.key)}
                </ScrollView>
              </View>
            ))}
          </Animated.ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  searchField: {
    flex: 1,
    minHeight: 42,
    borderRadius: 28,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#202225",
  },
  searchInput: {
    flex: 1,
    minHeight: 38,
    color: Colors.text,
    fontSize: 18,
    paddingVertical: 0,
  },
  tabsScroll: {
    flexGrow: 0,
  },
  tabsRow: {
    position: "relative",
    paddingHorizontal: 16,
    flexGrow: 1,
    justifyContent: "space-between",
  },
  tabButton: {
    flex: 1,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  tabText: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "600",
  },
  tabTextActive: {
    color: Colors.primary,
  },
  tabIndicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 3,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  resultsScroll: {
    flex: 1,
  },
  resultsPager: {
    flex: 1,
  },
  resultsTrack: {
    flex: 1,
  },
  resultsPage: {
    flex: 1,
  },
  resultsContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultBody: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  resultSubtitle: {
    color: Colors.mutedText,
    fontSize: 13,
    marginTop: 4,
  },
  emptyState: {
    paddingTop: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyDescription: {
    color: Colors.mutedText,
    fontSize: 14,
    textAlign: "center",
  },
});
