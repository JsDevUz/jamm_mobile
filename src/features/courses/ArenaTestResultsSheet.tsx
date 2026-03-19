import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { TextInput } from "../../components/TextInput";
import { useI18n } from "../../i18n";
import { arenaApi } from "../../lib/api";
import { Colors } from "../../theme/colors";
import type {
  ArenaTestHistory,
  ArenaTestPayload,
  ArenaTestResultsResponse,
} from "../../types/arena";

type Props = {
  visible: boolean;
  test: ArenaTestPayload | null;
  onClose: () => void;
};

const RESULTS_PAGE_SIZE = 20;

type FlattenedResult = {
  id: string;
  participantName: string;
  groupName: string;
  createdAt: string;
  score: number;
  total: number;
  accuracy: number;
  breakdowns: Array<{
    questionIndex: number;
    prompt: string;
    isCorrect: boolean;
    selectedText: string;
    correctText: string;
  }>;
};

function extractGroupName(nickname = "") {
  const match = String(nickname).match(/\(([^()]+)\)\s*$/);
  return match ? match[1].trim() : "";
}

function stripGroupSuffix(nickname = "") {
  return String(nickname).replace(/\s*\([^()]+\)\s*$/, "").trim();
}

function formatDate(value: string | undefined, language: "uz" | "en" | "ru", unknownLabel: string) {
  if (!value) {
    return unknownLabel;
  }

  const locale = language === "en" ? "en-US" : language === "ru" ? "ru-RU" : "uz-UZ";
  return new Date(value).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ArenaTestResultsSheet({ visible, test, onClose }: Props) {
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [debouncedGroupFilter, setDebouncedGroupFilter] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedGroupFilter(groupFilter.trim());
    }, 280);

    return () => clearTimeout(timer);
  }, [groupFilter]);

  const resultsQuery = useInfiniteQuery<ArenaTestResultsResponse>({
    queryKey: ["arena-test-results", test?._id || "unknown", debouncedGroupFilter],
    queryFn: ({ pageParam = 1 }) =>
      arenaApi.fetchTestResults(
        String(test?._id || ""),
        Number(pageParam || 1),
        RESULTS_PAGE_SIZE,
        debouncedGroupFilter,
      ),
    enabled: visible && Boolean(test?._id),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const currentPage = Number(lastPageParam || lastPage.page || 1);
      return (lastPage.totalPages || 1) > currentPage ? currentPage + 1 : undefined;
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    setExpandedId(null);
    setGroupFilter("");
    setDebouncedGroupFilter("");
  }, [test?._id, visible]);

  const rows = useMemo(() => {
    const histories = resultsQuery.data?.pages.flatMap((page) =>
      Array.isArray(page.data) ? (page.data as ArenaTestHistory[]) : [],
    ) || [];

    return histories
      .flatMap((history) =>
        (history.participants || []).map((participant, participantIndex) => {
          const total = Number(
            participant.total ||
              participant.results?.length ||
              test?.questions?.length ||
              0,
          );
          const score = Number(participant.score || 0);

      return {
            id: `${history._id || history.createdAt}-${participant.userId || participantIndex}`,
            participantName:
              stripGroupSuffix(participant.nickname) || "Foydalanuvchi",
            groupName: extractGroupName(participant.nickname),
            createdAt: String(history.createdAt || ""),
            score,
            total,
            accuracy: total > 0 ? Math.round((score / total) * 100) : 0,
            breakdowns: (participant.results || []).map((item) => {
              const question = test?.questions?.[item.questionIndex || 0];
              const selectedIndex = Array.isArray(participant.answers)
                ? participant.answers[item.questionIndex || 0]
                : -1;

              return {
                questionIndex: Number(item.questionIndex || 0),
                prompt:
                  question?.questionText ||
                  question?.question ||
                  question?.prompt ||
                  `${t("arenaShared.results.question")} #${Number(item.questionIndex || 0) + 1}`,
                isCorrect: Boolean(item.correct),
                selectedText:
                  selectedIndex >= 0
                    ? question?.options?.[selectedIndex] || "Javob topilmadi"
                    : "Javob berilmagan",
                correctText:
                  typeof item.correctOptionIndex === "number" && item.correctOptionIndex >= 0
                    ? question?.options?.[item.correctOptionIndex] || "Javob topilmadi"
                    : "Ma'lumot yo'q",
              };
            }),
          } satisfies FlattenedResult;
        }),
      )
      .sort(
        (left, right) =>
          new Date(right.createdAt || 0).getTime() -
          new Date(left.createdAt || 0).getTime(),
      );
  }, [resultsQuery.data?.pages, test?.questions]);

  useEffect(() => {
    setExpandedId(null);
  }, [debouncedGroupFilter]);

  const header = (
    <View style={styles.headerContent}>
      <Text style={styles.subtitle}>
        {t("arena.resultsScreen.subtitle", { title: test?.title || t("arena.testsList.untitled") })}
      </Text>

      <View style={styles.filterSection}>
        <View style={styles.filterHeader}>
          <Text style={styles.filterLabel}>{t("arena.resultsScreen.groupFilter")}</Text>
          {groupFilter ? (
            <Pressable onPress={() => setGroupFilter("")} hitSlop={8}>
              <Text style={styles.filterClear}>{t("arena.resultsScreen.clear")}</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          value={groupFilter}
          onChangeText={setGroupFilter}
          placeholder={t("arena.resultsScreen.groupPlaceholder")}
          placeholderTextColor={Colors.subtleText}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.filterInput}
        />

        <Text style={styles.filterHint}>
          {t("arena.resultsScreen.groupHint")}
        </Text>
      </View>
    </View>
  );

  return (
    <DraggableBottomSheet
      visible={visible}
      title={t("arena.resultsScreen.title")}
      onClose={onClose}
      minHeight={560}
      initialHeightRatio={0.84}
      maxHeightRatio={0.95}
    >
      {resultsQuery.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : resultsQuery.isError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>{t("arena.resultsScreen.loadFailed")}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => void resultsQuery.refetch()}
          >
            <Text style={styles.retryButtonText}>{t("arena.resultsScreen.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 16 + insets.bottom },
            rows.length === 0 ? styles.listContentEmpty : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (resultsQuery.hasNextPage && !resultsQuery.isFetchingNextPage) {
              void resultsQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.35}
          onRefresh={() => void resultsQuery.refetch()}
          refreshing={resultsQuery.isRefetching && !resultsQuery.isFetchingNextPage}
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Text style={styles.stateTitle}>{t("arena.resultsScreen.emptyTitle")}</Text>
              <Text style={styles.stateText}>
                {debouncedGroupFilter
                  ? t("arena.resultsScreen.emptyFiltered", { group: debouncedGroupFilter })
                  : t("arena.resultsScreen.empty")}
              </Text>
            </View>
          }
          ListFooterComponent={
            resultsQuery.isFetchingNextPage ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : (
              <View style={[styles.footerSpacer, { height: 12 + insets.bottom }]} />
            )
          }
          renderItem={({ item: row }) => {
            const isExpanded = expandedId === row.id;

            return (
              <View style={styles.card}>
                <Pressable
                  style={styles.cardHeader}
                  onPress={() =>
                    setExpandedId((current) => (current === row.id ? null : row.id))
                  }
                >
                  <View style={styles.cardHeaderCopy}>
                    <Text style={styles.participantName}>{row.participantName}</Text>
                    <Text style={styles.participantMeta}>
                      {row.groupName ? `${row.groupName} • ` : ""}
                      {formatDate(row.createdAt, language, t("arena.resultsScreen.unknownTime"))}
                    </Text>
                  </View>

                  <View style={styles.cardHeaderRight}>
                    <View style={styles.scorePill}>
                      <Text style={styles.scorePillText}>
                        {row.score}/{row.total} • {row.accuracy}%
                      </Text>
                    </View>
                    {isExpanded ? (
                      <ChevronUp size={18} color={Colors.subtleText} />
                    ) : (
                      <ChevronDown size={18} color={Colors.subtleText} />
                    )}
                  </View>
                </Pressable>

                {isExpanded ? (
                  <View style={styles.breakdownList}>
                    {row.breakdowns.length === 0 ? (
                      <Text style={styles.emptyBreakdown}>
                        Bu urinish uchun savol breakdown saqlanmagan.
                      </Text>
                    ) : (
                      row.breakdowns.map((item) => (
                        <View key={`${row.id}-${item.questionIndex}`} style={styles.breakdownCard}>
                          <Text style={styles.breakdownPrompt}>
                            {item.questionIndex + 1}. {item.prompt}
                          </Text>
                          <Text style={styles.breakdownText}>
                            Holat:{" "}
                            <Text
                              style={[
                                styles.breakdownStrong,
                                item.isCorrect
                                  ? styles.breakdownStrongCorrect
                                  : styles.breakdownStrongWrong,
                              ]}
                            >
                              {item.isCorrect ? "To'g'ri" : "Xato"}
                            </Text>
                          </Text>
                          <Text style={styles.breakdownText}>
                            Tanlangan javob:{" "}
                            <Text style={styles.breakdownStrong}>{item.selectedText}</Text>
                          </Text>
                          <Text style={styles.breakdownText}>
                            To'g'ri javob:{" "}
                            <Text
                              style={[
                                styles.breakdownStrong,
                                styles.breakdownStrongCorrect,
                              ]}
                            >
                              {item.correctText}
                            </Text>
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </DraggableBottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  headerContent: {
    gap: 14,
    paddingBottom: 14,
  },
  separator: {
    height: 12,
  },
  centerState: {
    flexGrow: 1,
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
    textAlign: "center",
  },
  stateText: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
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
  subtitle: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
  filterSection: {
    gap: 8,
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  filterLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  filterClear: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  filterInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    paddingHorizontal: 14,
    color: Colors.text,
    fontSize: 14,
  },
  filterHint: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    overflow: "hidden",
  },
  cardHeader: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  participantName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  participantMeta: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scorePill: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scorePillText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  breakdownList: {
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  emptyBreakdown: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  breakdownCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 12,
    gap: 6,
  },
  breakdownPrompt: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  breakdownText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  breakdownStrong: {
    color: Colors.text,
    fontWeight: "700",
  },
  breakdownStrongCorrect: {
    color: Colors.accent,
  },
  breakdownStrongWrong: {
    color: Colors.danger,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  footerSpacer: {
    height: 12,
  },
});
