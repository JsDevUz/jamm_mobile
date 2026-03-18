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
import { arenaApi } from "../../lib/api";
import { Colors } from "../../theme/colors";
import type {
  ArenaSentenceBuilderDeck,
  ArenaSentenceBuilderResultsResponse,
} from "../../types/arena";

type Props = {
  visible: boolean;
  deck: ArenaSentenceBuilderDeck | null;
  onClose: () => void;
};

type ResultRow = {
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
    selectedTokens: string[];
    expectedTokens: string[];
  }>;
};

const RESULTS_PAGE_SIZE = 20;

function formatDate(value?: string) {
  if (!value) {
    return "Vaqti noma'lum";
  }

  return new Date(value).toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ArenaSentenceBuilderResultsSheet({ visible, deck, onClose }: Props) {
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

  useEffect(() => {
    setExpandedId(null);
    setGroupFilter("");
    setDebouncedGroupFilter("");
  }, [deck?._id, visible]);

  const resultsQuery = useInfiniteQuery<ArenaSentenceBuilderResultsResponse>({
    queryKey: ["arena-sentence-builder-results", deck?._id || "unknown", debouncedGroupFilter],
    queryFn: ({ pageParam = 1 }) =>
      arenaApi.fetchSentenceBuilderResults(
        String(deck?._id || ""),
        Number(pageParam || 1),
        RESULTS_PAGE_SIZE,
        debouncedGroupFilter,
      ),
    enabled: visible && Boolean(deck?._id),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const currentPage = Number(lastPageParam || lastPage.page || 1);
      return (lastPage.totalPages || 1) > currentPage ? currentPage + 1 : undefined;
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const rows = useMemo(() => {
    const items =
      resultsQuery.data?.pages.flatMap((page) =>
        Array.isArray(page.data) ? page.data : [],
      ) || [];

    return items.map((attempt, index) => {
      const score = Number(attempt.score || 0);
      const total = Number(attempt.total || attempt.items?.length || 0);
      const accuracy =
        typeof attempt.accuracy === "number"
          ? Number(attempt.accuracy)
          : total > 0
            ? Math.round((score / total) * 100)
            : 0;

      return {
        id: String(
          attempt._id || `${attempt.participantName || "participant"}-${attempt.createdAt || index}`,
        ),
        participantName: String(attempt.participantName || "Foydalanuvchi"),
        groupName: String(attempt.groupName || ""),
        createdAt: String(attempt.createdAt || ""),
        score,
        total,
        accuracy,
        breakdowns: (attempt.items || []).map((item, itemIndex) => ({
          questionIndex:
            typeof item.questionIndex === "number" ? item.questionIndex : itemIndex,
          prompt:
            item.prompt ||
            deck?.items?.[item.questionIndex || itemIndex]?.prompt ||
            `Savol #${itemIndex + 1}`,
          isCorrect: Boolean(item.isCorrect),
          selectedTokens: Array.isArray(item.selectedTokens) ? item.selectedTokens : [],
          expectedTokens: Array.isArray(item.expectedTokens) ? item.expectedTokens : [],
        })),
      } satisfies ResultRow;
    });
  }, [deck?.items, resultsQuery.data?.pages]);

  const header = (
    <View style={styles.headerContent}>
      <Text style={styles.subtitle}>
        "{deck?.title || "Gap tuzish"}" bo'yicha ishlagan foydalanuvchilar va har bir
        savoldagi breakdown.
      </Text>

      <View style={styles.filterSection}>
        <View style={styles.filterHeader}>
          <Text style={styles.filterLabel}>Guruh filtri</Text>
          {groupFilter ? (
            <Pressable onPress={() => setGroupFilter("")} hitSlop={8}>
              <Text style={styles.filterClear}>Tozalash</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          value={groupFilter}
          onChangeText={setGroupFilter}
          placeholder="Guruh nomi bo'yicha qidiring"
          placeholderTextColor={Colors.subtleText}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.filterInput}
        />
      </View>
    </View>
  );

  return (
    <DraggableBottomSheet
      visible={visible}
      title="Natijalar"
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
          <Text style={styles.stateTitle}>Natijalar yuklanmadi</Text>
          <Pressable style={styles.retryButton} onPress={() => void resultsQuery.refetch()}>
            <Text style={styles.retryButtonText}>Qayta yuklash</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 28 + insets.bottom },
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
              <Text style={styles.stateTitle}>Natijalar topilmadi</Text>
              <Text style={styles.stateText}>
                {debouncedGroupFilter
                  ? `"${debouncedGroupFilter}" guruhiga mos urinishlar topilmadi.`
                  : "Bu to'plam bo'yicha hali saqlangan urinishlar yo'q."}
              </Text>
            </View>
          }
          ListFooterComponent={
            resultsQuery.isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : (
              <View style={[styles.footerLoader, { paddingVertical: 10 + insets.bottom }]} />
            )
          }
          renderItem={({ item }) => {
            const expanded = expandedId === item.id;
            return (
              <View style={styles.resultCard}>
                <Pressable
                  style={styles.resultHeader}
                  onPress={() => setExpandedId(expanded ? null : item.id)}
                >
                  <View style={styles.resultMeta}>
                    <Text style={styles.resultTitle}>{item.participantName}</Text>
                    <Text style={styles.resultSubtitle}>
                      {item.groupName ? `${item.groupName} · ` : ""}
                      {formatDate(item.createdAt)}
                    </Text>
                  </View>

                  <View style={styles.scoreWrap}>
                    <Text style={styles.scoreValue}>
                      {item.score}/{item.total}
                    </Text>
                    <Text style={styles.scoreAccuracy}>{item.accuracy}%</Text>
                    {expanded ? (
                      <ChevronUp size={18} color={Colors.mutedText} />
                    ) : (
                      <ChevronDown size={18} color={Colors.mutedText} />
                    )}
                  </View>
                </Pressable>

                {expanded ? (
                  <View style={styles.breakdownList}>
                    {item.breakdowns.map((breakdown) => (
                      <View key={`${item.id}-${breakdown.questionIndex}`} style={styles.breakdownCard}>
                        <Text style={styles.breakdownTitle}>
                          Savol #{breakdown.questionIndex + 1}: {breakdown.prompt}
                        </Text>
                        <Text
                          style={[
                            styles.breakdownState,
                            breakdown.isCorrect
                              ? styles.breakdownStateCorrect
                              : styles.breakdownStateWrong,
                          ]}
                        >
                          {breakdown.isCorrect ? "To'g'ri" : "Xato"}
                        </Text>
                        <View style={styles.tokenWrap}>
                          {breakdown.expectedTokens.map((token, tokenIndex) => (
                            <View key={`${token}-${tokenIndex}`} style={[styles.tokenChip, styles.tokenChipExpected]}>
                              <Text style={styles.tokenText}>{token}</Text>
                            </View>
                          ))}
                        </View>
                        {!breakdown.isCorrect && breakdown.selectedTokens.length ? (
                          <View style={styles.tokenWrap}>
                            {breakdown.selectedTokens.map((token, tokenIndex) => (
                              <View key={`${token}-${tokenIndex}`} style={[styles.tokenChip, styles.tokenChipSelected]}>
                                <Text style={styles.tokenText}>{token}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ))}
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
  headerContent: {
    gap: 16,
    paddingBottom: 10,
  },
  subtitle: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  filterSection: {
    gap: 8,
  },
  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  filterClear: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  filterInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    minHeight: 48,
  },
  centerState: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stateTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  stateText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: 12,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: "center",
  },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  resultHeader: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  resultMeta: {
    flex: 1,
    gap: 4,
  },
  resultTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  resultSubtitle: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  scoreWrap: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
  },
  scoreValue: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  scoreAccuracy: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  breakdownList: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  breakdownCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 12,
    gap: 8,
  },
  breakdownTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  breakdownState: {
    fontSize: 12,
    fontWeight: "700",
  },
  breakdownStateCorrect: {
    color: "#16a34a",
  },
  breakdownStateWrong: {
    color: Colors.danger,
  },
  tokenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tokenChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  tokenChipExpected: {
    borderColor: "rgba(34,197,94,0.3)",
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  tokenChipSelected: {
    borderColor: "rgba(239,68,68,0.25)",
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  tokenText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
});
