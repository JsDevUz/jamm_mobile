import { Pressable, StyleSheet, Text, View } from "react-native";
import { FolderOpen, Globe2 } from "lucide-react-native";
import { useI18n } from "../../../i18n";
import { openJammAwareLink } from "../../../navigation/internalLinks";
import { Colors } from "../../../theme/colors";
import type { CourseLessonMaterial } from "../../../types/courses";

type Props = {
  visible: boolean;
  materials: CourseLessonMaterial[];
  formatFileSize: (bytes?: number | null) => string;
};

export function LessonMaterialsSection({ visible, materials, formatFileSize }: Props) {
  const { t } = useI18n();
  if (!visible || !materials.length) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <FolderOpen size={17} color={Colors.primary} />
          <Text style={styles.title}>{t("coursePlayer.materials.title")}</Text>
        </View>
        <Text style={styles.count}>{materials.length}</Text>
      </View>
      <Text style={styles.hint}>{t("coursePlayer.materials.studentHint")}</Text>
      <View style={styles.list}>
        {materials.map((item) => (
          <View key={item.materialId || item.fileUrl} style={styles.card}>
            <View style={styles.meta}>
              <Text style={styles.name}>{item.title || item.fileName}</Text>
              <Text style={styles.sub}>
                {item.fileName} · {formatFileSize(item.fileSize)}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                style={styles.iconButton}
                onPress={() => {
                  if (!item.fileUrl) {
                    return;
                  }

                  void openJammAwareLink(item.fileUrl).catch(() => undefined);
                }}
              >
                <Globe2 size={15} color={Colors.text} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  count: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "700",
  },
  hint: {
    color: Colors.subtleText,
    fontSize: 13,
    lineHeight: 19,
  },
  list: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  sub: {
    color: Colors.subtleText,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
});
