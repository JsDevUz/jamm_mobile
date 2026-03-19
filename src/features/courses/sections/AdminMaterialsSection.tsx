import { Pressable, Text, View } from "react-native";
import { Globe2, Plus, Trash2 } from "lucide-react-native";
import { openJammAwareLink } from "../../../navigation/internalLinks";
import { Colors } from "../../../theme/colors";
import type { CourseLessonMaterial } from "../../../types/courses";
import { adminResourceSectionStyles as styles } from "./adminResourceSectionStyles";

type AdminMaterialsSectionProps = {
  materials: CourseLessonMaterial[];
  formatFileSize: (bytes?: number | null) => string;
  onAdd: () => void;
  onDelete: (materialId?: string) => void;
};

export function AdminMaterialsSection({
  materials,
  formatFileSize,
  onAdd,
  onDelete,
}: AdminMaterialsSectionProps) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Materiallar</Text>
        <Pressable style={styles.inlineAction} onPress={onAdd}>
          <Plus size={14} color={Colors.primary} />
          <Text style={styles.inlineActionText}>Qo'shish</Text>
        </Pressable>
      </View>
      {materials.length ? (
        <View style={{ ...styles.materialsList, paddingHorizontal: 14 }}>
          {materials.map((item) => (
            <View key={item.materialId || item.fileUrl} style={styles.materialCard}>
              <View style={styles.materialMeta}>
                <Text style={styles.materialName}>{item.title || item.fileName}</Text>
                <Text style={styles.materialSub}>
                  {item.fileName} · {formatFileSize(item.fileSize)}
                </Text>
              </View>
              <View style={styles.materialActions}>
                <Pressable
                  style={styles.materialIconButton}
                  onPress={() => {
                    if (!item.fileUrl) {
                      return;
                    }

                    void openJammAwareLink(item.fileUrl).catch(() => undefined);
                  }}
                >
                  <Globe2 size={15} color={Colors.text} />
                </Pressable>
                <Pressable style={styles.materialIconButton} onPress={() => onDelete(item.materialId)}>
                  <Trash2 size={15} color={Colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>Materiallar hali qo'shilmagan.</Text>
      )}
    </View>
  );
}
