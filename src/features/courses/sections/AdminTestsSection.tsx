import { Pressable, Text, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { Colors } from "../../../theme/colors";
import type { CourseLinkedTest } from "../../../types/courses";
import { adminResourceSectionStyles as styles } from "./adminResourceSectionStyles";

type AdminTestsSectionProps = {
  linkedTests: CourseLinkedTest[];
  onAdd: () => void;
  onStart: (test: CourseLinkedTest) => void | Promise<void>;
  onDelete: (linkedTestId?: string) => void;
};

export function AdminTestsSection({
  linkedTests,
  onAdd,
  onStart,
  onDelete,
}: AdminTestsSectionProps) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Maydon mashqlari</Text>
        <Pressable style={styles.inlineAction} onPress={onAdd}>
          <Plus size={14} color={Colors.primary} />
          <Text style={styles.inlineActionText}>Qo'shish</Text>
        </Pressable>
      </View>
      {linkedTests.length ? (
        <View style={styles.resourceList}>
          {linkedTests.map((item) => (
            <View key={item.linkedTestId || item.url} style={styles.resourceRow}>
              <View style={styles.resourceCopy}>
                <Text style={styles.resourceTitle}>{item.title}</Text>
                <Text style={styles.resourceMeta}>
                  {item.resourceType === "sentenceBuilder" ? "Sentence builder" : "Quiz"} · min{" "}
                  {item.minimumScore || 0}%
                </Text>
                {item.selfProgress ? (
                  <Text style={styles.progressBadgeText}>
                    {item.selfProgress.bestPercent || item.selfProgress.percent || 0}% ·{" "}
                    {item.selfProgress.passed ? "Passed" : "Waiting"}
                  </Text>
                ) : null}
              </View>
              <View style={styles.resourceActions}>
                <Pressable style={styles.resourceButton} onPress={() => void onStart(item)}>
                  <Text style={styles.resourceButtonText}>Boshlash</Text>
                </Pressable>
                <Pressable style={styles.rowIconButton} onPress={() => onDelete(item.linkedTestId)}>
                  <Trash2 size={14} color={Colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>Maydon mashqlari hali ulanmagan.</Text>
      )}
    </View>
  );
}
