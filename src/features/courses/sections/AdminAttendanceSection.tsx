import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { PersistentCachedImage } from "../../../components/PersistentCachedImage";
import { Colors } from "../../../theme/colors";
import type { CourseLessonAttendanceResponse } from "../../../types/courses";
import { adminResourceSectionStyles as styles } from "./adminResourceSectionStyles";

type AttendanceStatus = "present" | "late" | "absent";

type AdminAttendanceSectionProps = {
  loading: boolean;
  attendance: CourseLessonAttendanceResponse | null | undefined;
  actionTargetId?: string | null;
  onStatusChange: (memberId: string, status: AttendanceStatus) => void | Promise<void>;
};

const STATUSES: AttendanceStatus[] = ["present", "late", "absent"];

export function AdminAttendanceSection({
  loading,
  attendance,
  actionTargetId,
  onStatusChange,
}: AdminAttendanceSectionProps) {
  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const members = attendance?.members || [];

  return (
    <View style={styles.stack}>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Present</Text>
          <Text style={styles.summaryValue}>{attendance?.summary?.present || 0}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Late</Text>
          <Text style={styles.summaryValue}>{attendance?.summary?.late || 0}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Absent</Text>
          <Text style={styles.summaryValue}>{attendance?.summary?.absent || 0}</Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Davomat</Text>
          <Text style={styles.sectionMuted}>{members.length} ta talaba</Text>
        </View>
        {members.length ? (
          <View style={styles.list}>
            {members.map((member) => {
              const memberId = String(member.userId || "");
              return (
                <View key={memberId} style={styles.memberRow}>
                  <View style={styles.memberMeta}>
                    <View style={styles.memberAvatar}>
                      {member.userAvatar ? (
                        <PersistentCachedImage
                          remoteUri={member.userAvatar}
                          style={styles.memberAvatarImage}
                        />
                      ) : (
                        <Text style={styles.memberAvatarLetter}>
                          {String(member.userName || "?").charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName}>{member.userName}</Text>
                      <Text style={styles.memberSub}>
                        {member.progressPercent || 0}% progress · {member.source || "manual"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.attendanceActions}>
                    {STATUSES.map((status) => {
                      const loadingThis = actionTargetId === memberId && member.status !== status;
                      const isActive = member.status === status;
                      return (
                        <Pressable
                          key={status}
                          style={[styles.statusChip, isActive && styles.statusChipActive]}
                          onPress={() => void onStatusChange(memberId, status)}
                        >
                          {loadingThis ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                          ) : (
                            <Text
                              style={[
                                styles.statusChipText,
                                isActive && styles.statusChipTextActive,
                              ]}
                            >
                              {status === "present" ? "Present" : status === "late" ? "Late" : "Absent"}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>Davomat uchun talaba topilmadi.</Text>
        )}
      </View>
    </View>
  );
}
