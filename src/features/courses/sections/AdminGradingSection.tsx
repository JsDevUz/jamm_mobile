import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Check, Pencil } from "lucide-react-native";
import { PersistentCachedImage } from "../../../components/PersistentCachedImage";
import { TextInput } from "../../../components/TextInput";
import { Colors } from "../../../theme/colors";
import type { CourseLessonGradingResponse, CourseLessonGradingRow } from "../../../types/courses";
import { adminResourceSectionStyles as styles } from "./adminResourceSectionStyles";

type AdminGradingSectionProps = {
  loading: boolean;
  grading: CourseLessonGradingResponse | null | undefined;
  editingRows: Record<string, boolean>;
  savingUserId?: string | null;
  oralScoreDrafts: Record<string, string>;
  oralNoteDrafts: Record<string, string>;
  onOpenEditor: (row: CourseLessonGradingRow) => void;
  onCloseEditor: (userId: string) => void;
  onScoreDraftChange: (userId: string, value: string) => void;
  onNoteDraftChange: (userId: string, value: string) => void;
  onSave: (userId: string) => void | Promise<void>;
};

export function AdminGradingSection({
  loading,
  grading,
  editingRows,
  savingUserId,
  oralScoreDrafts,
  oralNoteDrafts,
  onOpenEditor,
  onCloseEditor,
  onScoreDraftChange,
  onNoteDraftChange,
  onSave,
}: AdminGradingSectionProps) {
  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const rows = grading?.lesson?.students || [];

  return (
    <View style={styles.stack}>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>O'rtacha</Text>
          <Text style={styles.summaryValue}>{grading?.lesson?.summary?.averageScore || 0}%</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Homework</Text>
          <Text style={styles.summaryValue}>
            {grading?.lesson?.summary?.completedHomeworkCount || 0}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Attendance</Text>
          <Text style={styles.summaryValue}>
            {grading?.lesson?.summary?.attendanceMarkedCount || 0}
          </Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Baholash</Text>
          <Text style={styles.sectionMuted}>{rows.length} ta talaba</Text>
        </View>
        {rows.length ? (
          <View style={styles.list}>
            {rows.map((row) => {
              const rowUserId = String(row.userId || "");
              const isEditing = editingRows[rowUserId];
              const isSaving = savingUserId === rowUserId;
              return (
                <View key={rowUserId} style={styles.studentCard}>
                  <View style={styles.memberMeta}>
                    <View style={styles.memberAvatar}>
                      {row.userAvatar ? (
                        <PersistentCachedImage
                          remoteUri={row.userAvatar}
                          style={styles.memberAvatarImage}
                        />
                      ) : (
                        <Text style={styles.memberAvatarLetter}>
                          {String(row.userName || "?").charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName}>{row.userName}</Text>
                      <Text style={styles.memberSub}>
                        Score {Math.round(row.lessonScore || 0)} · {row.performance || "Normal"}
                      </Text>
                    </View>
                    <Pressable style={styles.rowIconButton} onPress={() => onOpenEditor(row)}>
                      <Pencil size={14} color={Colors.primary} />
                    </Pressable>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.extraPill}>
                      <Text style={styles.extraPillText}>
                        Davomat: {row.attendanceStatus || "absent"}
                      </Text>
                    </View>
                    <View style={styles.extraPill}>
                      <Text style={styles.extraPillText}>
                        Homework: {row.homeworkStatus || "pending"}
                      </Text>
                    </View>
                  </View>

                  {isEditing ? (
                    <View style={styles.oralEditor}>
                      <TextInput
                        value={oralScoreDrafts[rowUserId] ?? ""}
                        onChangeText={(value) => onScoreDraftChange(rowUserId, value)}
                        keyboardType="number-pad"
                        placeholder="Og'zaki baho"
                        placeholderTextColor={Colors.subtleText}
                        style={styles.input}
                      />
                      <TextInput
                        value={oralNoteDrafts[rowUserId] ?? ""}
                        onChangeText={(value) => onNoteDraftChange(rowUserId, value)}
                        placeholder="Izoh"
                        placeholderTextColor={Colors.subtleText}
                        multiline
                        textAlignVertical="top"
                        style={styles.textarea}
                      />
                      <View style={styles.resourceActions}>
                        <Pressable
                          style={[styles.inlineAction, styles.inlineActionMuted]}
                          onPress={() => onCloseEditor(rowUserId)}
                        >
                          <Text style={styles.inlineActionTextMuted}>Bekor qilish</Text>
                        </Pressable>
                        <Pressable
                          style={styles.inlineAction}
                          disabled={isSaving}
                          onPress={() => void onSave(rowUserId)}
                        >
                          {isSaving ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                          ) : (
                            <>
                              <Check size={14} color={Colors.primary} />
                              <Text style={styles.inlineActionText}>Saqlash</Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.oralSummary}>
                      <Text style={styles.oralSummaryTitle}>
                        Og'zaki baho:{" "}
                        <Text style={styles.oralSummaryValue}>
                          {row.oralScore === null || row.oralScore === undefined ? "-" : row.oralScore}
                        </Text>
                      </Text>
                      {row.oralNote ? <Text style={styles.memberSub}>{row.oralNote}</Text> : null}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>Baholash ma'lumoti hozircha yo'q.</Text>
        )}
      </View>
    </View>
  );
}
