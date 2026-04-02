import type { ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, Pencil, Trash2, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../../theme/colors";
import type { CourseLesson } from "../../../types/courses";

export type CourseAdminTab = "tests" | "homework" | "attendance" | "grading" | "members";

type CourseAdminPaneProps = {
  visible: boolean;
  isOwner: boolean;
  isWeb: boolean;
  backdropOpacity: Animated.AnimatedInterpolation<number> | Animated.Value;
  translateX: Animated.Value;
  currentCourseName?: string | null;
  currentLesson: CourseLesson | null;
  lessons: CourseLesson[];
  selectedLessonId?: string | null;
  selectedHasMedia: boolean;
  publishedLessonsCount: number;
  draftLessonsCount: number;
  approvedMembersCount: number;
  activeTab: CourseAdminTab;
  onTabChange: (tab: CourseAdminTab) => void;
  onClose: () => void;
  onEdit: () => void;
  onPublish: () => void | Promise<void>;
  onDelete: (lesson: CourseLesson) => void | Promise<void>;
  onSelectLesson: (lesson: CourseLesson) => void | Promise<void>;
  materialsCard: ReactNode;
  tabContent: ReactNode;
};

const ADMIN_TABS: Array<{ key: CourseAdminTab; label: string }> = [
  { key: "tests", label: "Tests" },
  { key: "homework", label: "Homework" },
  { key: "attendance", label: "Attendance" },
  { key: "grading", label: "Grading" },
  { key: "members", label: "Members" },
];

export function CourseAdminPane({
  visible,
  isOwner,
  isWeb,
  backdropOpacity,
  translateX,
  currentCourseName,
  currentLesson,
  lessons,
  selectedLessonId,
  selectedHasMedia,
  publishedLessonsCount,
  draftLessonsCount,
  approvedMembersCount,
  activeTab,
  onTabChange,
  onClose,
  onEdit,
  onPublish,
  onDelete,
  onSelectLesson,
  materialsCard,
  tabContent,
}: CourseAdminPaneProps) {
  const adminPaneLesson = currentLesson || lessons[0] || null;

  if (!visible || !isOwner || !adminPaneLesson) {
    return null;
  }

  const content = (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Animated.View
        style={[
          styles.shell,
          isWeb
            ? null
            : {
                transform: [{ translateX }],
              },
        ]}
      >
        <View style={styles.topBar}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={2}>
              {adminPaneLesson.title || currentCourseName || "Boshqarish"}
            </Text>
            <Text style={styles.muted}>Joriy dars boshqaruvi</Text>
          </View>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <X size={18} color={Colors.text} />
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.ghostButton} onPress={onEdit}>
            <Pencil size={15} color={Colors.text} />
            <Text style={styles.ghostButtonText}>Tahrirlash</Text>
          </Pressable>
          {(adminPaneLesson.status || "published") === "draft" && selectedHasMedia ? (
            <Pressable style={styles.primaryButton} onPress={() => void onPublish()}>
              <Check size={15} color="#fff" />
              <Text style={styles.primaryButtonText}>Publish</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.dangerButton} onPress={() => void onDelete(adminPaneLesson)}>
            <Trash2 size={15} color={Colors.danger} />
            <Text style={styles.dangerButtonText}>O'chirish</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.lessonStrip}
            keyboardShouldPersistTaps="handled"
          >
            {lessons.map((lesson, index) => {
              const lessonId = String(lesson._id || lesson.urlSlug || index);
              const active = lessonId === String(selectedLessonId || "");
              return (
                <Pressable
                  key={lessonId}
                  style={[styles.lessonButton, active && styles.lessonButtonActive]}
                  onPress={() => void onSelectLesson(lesson)}
                >
                  <Text
                    style={[styles.lessonTitle, active && styles.lessonTitleActive]}
                    numberOfLines={1}
                  >
                    {lesson.title || `${index + 1}-dars`}
                  </Text>
                  <View style={styles.lessonMeta}>
                    <Text style={styles.lessonMetaText}>{index + 1}-dars</Text>
                    <View
                      style={[
                        styles.statusPill,
                        (lesson.status || "published") === "draft" && styles.statusPillDraft,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          (lesson.status || "published") === "draft" &&
                            styles.statusPillTextDraft,
                        ]}
                      >
                        {(lesson.status || "published") === "draft" ? "Draft" : "Published"}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Jami dars</Text>
              <Text style={styles.summaryValue}>{lessons.length}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Published</Text>
              <Text style={styles.summaryValue}>{publishedLessonsCount}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Draft</Text>
              <Text style={styles.summaryValue}>{draftLessonsCount}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Talabalar</Text>
              <Text style={styles.summaryValue}>{approvedMembersCount}</Text>
            </View>
          </View>

          {materialsCard}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
            keyboardShouldPersistTaps="handled"
          >
            {ADMIN_TABS.map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
                onPress={() => onTabChange(tab.key)}
              >
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {tabContent}
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );

  if (isWeb) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
            {content}
          </SafeAreaView>
        </View>
      </Modal>
    );
  }

  return (
    <Animated.View style={styles.overlay}>
      <Animated.View style={[styles.backdropFade, { opacity: backdropOpacity }]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
      </Animated.View>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        {content}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    minHeight: 0,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
  },
  backdropFade: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 15, 28, 0.62)",
  },
  safeArea: {
    flex: 1,
    minHeight: 0,
  },
  shell: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Colors.background,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  titleWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  muted: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ghostButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ghostButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  dangerButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.28)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dangerButtonText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  lessonStrip: {
    gap: 10,
    paddingBottom: 2,
  },
  lessonButton: {
    width: 208,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  lessonButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  lessonTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  lessonTitleActive: {
    color: Colors.primary,
  },
  lessonMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  lessonMetaText: {
    color: Colors.subtleText,
    fontSize: 11,
    fontWeight: "600",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: "47%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 6,
  },
  summaryLabel: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "600",
  },
  summaryValue: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  tabs: {
    gap: 8,
    paddingBottom: 2,
  },
  tabButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  tabText: {
    color: Colors.subtleText,
    fontSize: 13,
    fontWeight: "700",
  },
  tabTextActive: {
    color: Colors.primary,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(67, 181, 129, 0.14)",
  },
  statusPillDraft: {
    backgroundColor: "rgba(250, 166, 26, 0.14)",
  },
  statusPillText: {
    color: Colors.accent,
    fontSize: 10,
    fontWeight: "800",
  },
  statusPillTextDraft: {
    color: Colors.warning,
  },
});
