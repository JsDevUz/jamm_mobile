import { Pressable, Text, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { Colors } from "../../../theme/colors";
import type { CourseHomeworkAssignment } from "../../../types/courses";
import { adminResourceSectionStyles as styles } from "./adminResourceSectionStyles";

type AdminHomeworkSectionProps = {
  assignments: CourseHomeworkAssignment[];
  onAdd: () => void;
  onDelete: (assignmentId?: string) => void;
  timeAgo: (value?: string | null) => string;
};

export function AdminHomeworkSection({
  assignments,
  onAdd,
  onDelete,
  timeAgo,
}: AdminHomeworkSectionProps) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Homework</Text>
        <Pressable style={styles.inlineAction} onPress={onAdd}>
          <Plus size={14} color={Colors.primary} />
          <Text style={styles.inlineActionText}>Qo'shish</Text>
        </Pressable>
      </View>
      {assignments.length ? (
        <View style={{ ...styles.resourceList, paddingHorizontal: 14 }}>
          {assignments.map((item) => (
            <View key={item.assignmentId || item.title} style={styles.homeworkCard}>
              <View style={styles.resourceCopy}>
                <Text style={styles.resourceTitle}>{item.title}</Text>
                <Text style={styles.resourceMeta}>
                  {item.type} · {item.maxScore || 0} ball
                  {item.deadline ? ` · ${timeAgo(item.deadline)}` : ""}
                </Text>
                {item.description ? (
                  <Text style={styles.homeworkDescription}>{item.description}</Text>
                ) : null}
                <Text style={styles.resourceMeta}>
                  {item.submissionCount || 0} topshiriq topshirilgan
                </Text>
              </View>
              <View style={styles.resourceActions}>
                <Pressable style={styles.rowIconButton} onPress={() => onDelete(item.assignmentId)}>
                  <Trash2 size={14} color={Colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>Homework hali qo'shilmagan.</Text>
      )}
    </View>
  );
}
