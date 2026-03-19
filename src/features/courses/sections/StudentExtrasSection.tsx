import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, ClipboardList, FileText } from "lucide-react-native";
import { useI18n } from "../../../i18n";
import { Colors } from "../../../theme/colors";
import type { CourseHomeworkAssignment, CourseLinkedTest } from "../../../types/courses";

type Props = {
  visible: boolean;
  open: boolean;
  onToggle: () => void;
  linkedTests: CourseLinkedTest[];
  homeworkAssignments: CourseHomeworkAssignment[];
  onOpenLinkedTest: (item: CourseLinkedTest) => void | Promise<void>;
  onOpenHomeworkSubmit: (item: CourseHomeworkAssignment) => void;
  timeAgo: (value?: string | null) => string;
};

export function StudentExtrasSection({
  visible,
  open,
  onToggle,
  linkedTests,
  homeworkAssignments,
  onOpenLinkedTest,
  onOpenHomeworkSubmit,
  timeAgo,
}: Props) {
  const { t } = useI18n();
  if (!visible) {
    return null;
  }

  const hasLessonTests = linkedTests.length > 0;
  const hasHomework = homeworkAssignments.some((item) => item.enabled !== false);

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={onToggle}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t("coursePlayer.extras.title")}</Text>
            {open ? (
              <ChevronUp size={16} color={Colors.subtleText} />
            ) : (
              <ChevronDown size={16} color={Colors.subtleText} />
            )}
          </View>
          <Text style={styles.hint}>{t("coursePlayer.extras.description")}</Text>
        </View>
        {!open ? (
          <View style={styles.badgeRow}>
            {hasLessonTests ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("coursePlayer.lessonTests.title")}</Text>
              </View>
            ) : null}
            {hasHomework ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("coursePlayer.homework.title")}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {hasLessonTests ? (
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <ClipboardList size={16} color={Colors.primary} />
                <Text style={styles.blockTitle}>{t("coursePlayer.lessonTests.title")}</Text>
              </View>
              <Text style={styles.blockHint}>
                {t("coursePlayer.lessonTests.studentHint", {
                  count: linkedTests.filter((item) => item.selfProgress?.passed).length,
                  total: linkedTests.length,
                })}
              </Text>
              <View style={styles.resourceList}>
                {linkedTests.map((item) => (
                  <View key={item.linkedTestId || item.url} style={styles.resourceRow}>
                    <View style={styles.resourceCopy}>
                      <Text style={styles.resourceTitle}>{item.title}</Text>
                      <Text style={styles.resourceMeta}>
                        {item.resourceType === "sentenceBuilder"
                          ? t("coursePlayer.lessonTests.typeSentenceBuilder")
                          : t("coursePlayer.lessonTests.typeTest")} · min {item.minimumScore || 0}%
                      </Text>
                      {item.selfProgress ? (
                        <Text style={styles.progressText}>
                          {item.selfProgress.bestPercent || item.selfProgress.percent || 0}% · {item.selfProgress.passed ? t("coursePlayer.lessonTests.completed") : t("coursePlayer.homework.status.submitted")}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable style={styles.resourceButton} onPress={() => void onOpenLinkedTest(item)}>
                      <Text style={styles.resourceButtonText}>{t("coursePlayer.lessonTests.start")}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {hasHomework ? (
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <FileText size={16} color={Colors.primary} />
                <Text style={styles.blockTitle}>{t("coursePlayer.homework.title")}</Text>
              </View>
              <Text style={styles.blockHint}>{t("coursePlayer.homework.studentHint")}</Text>
              <View style={styles.resourceList}>
                {homeworkAssignments.map((item) => (
                  <View key={item.assignmentId || item.title} style={styles.homeworkCard}>
                    <View style={styles.resourceCopy}>
                      <Text style={styles.resourceTitle}>{item.title}</Text>
                      <Text style={styles.resourceMeta}>
                        {item.type} · {item.maxScore || 0} {t("coursePlayer.homework.scoreLabel").toLowerCase()}
                        {item.deadline ? ` · ${timeAgo(item.deadline)}` : ""}
                      </Text>
                      {item.description ? <Text style={styles.homeworkDescription}>{item.description}</Text> : null}
                      {item.selfSubmission ? (
                        <Text style={styles.progressText}>
                          {item.selfSubmission.status
                            ? t(`coursePlayer.homework.status.${item.selfSubmission.status}`)
                            : t("coursePlayer.homework.status.submitted")}
                          {item.selfSubmission.score !== null && item.selfSubmission.score !== undefined
                            ? ` · ${item.selfSubmission.score} ${t("coursePlayer.homework.scoreLabel").toLowerCase()}`
                            : ""}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable style={styles.resourceButton} onPress={() => onOpenHomeworkSubmit(item)}>
                      <Text style={styles.resourceButtonText}>
                        {item.selfSubmission ? t("coursePlayer.lessonTests.retry") : t("coursePlayer.homework.submit")}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderBottomWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  headerCopy: {
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  hint: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    borderWidth: 1,
    borderColor: "rgba(67,181,129,0.24)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(67,181,129,0.1)",
  },
  badgeText: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  block: {
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  blockTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  blockHint: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  resourceList: {
    gap: 12,
  },
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resourceCopy: {
    flex: 1,
    gap: 4,
  },
  resourceTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  resourceMeta: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  progressText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  resourceButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  resourceButtonText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  homeworkCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  homeworkDescription: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
});
