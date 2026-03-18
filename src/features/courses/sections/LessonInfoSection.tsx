import { Pressable, StyleSheet, Text, View } from "react-native";
import { Copy, Eye, Heart, ListVideo } from "lucide-react-native";
import { Colors } from "../../../theme/colors";

type Props = {
  visible: boolean;
  views: number;
  likes: number;
  liked: boolean;
  onLike: () => void;
  onCopy: () => void;
  description?: string | null;
  onOpenDescription: () => void;
  mediaCount: number;
  activeMediaIndex: number;
};

export function LessonInfoSection({
  visible,
  views,
  likes,
  liked,
  onLike,
  onCopy,
  description,
  onOpenDescription,
  mediaCount,
  activeMediaIndex,
}: Props) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Eye size={14} color={Colors.subtleText} />
          <Text style={styles.metaText}>{views} ko'rish</Text>
        </View>
        <Pressable style={[styles.metaItem, liked && styles.metaItemLiked]} onPress={onLike}>
          <Heart
            size={14}
            color={liked ? Colors.danger : Colors.subtleText}
            fill={liked ? Colors.danger : "transparent"}
          />
          <Text style={[styles.metaText, liked && styles.metaTextLiked]}>{likes} like</Text>
        </Pressable>
        <Pressable style={styles.metaItem} onPress={onCopy}>
          <Copy size={14} color={Colors.subtleText} />
          <Text style={styles.metaText}>Nusxalash</Text>
        </Pressable>
        {description ? (
          <Pressable style={styles.descriptionCard} onPress={onOpenDescription}>
            <Text style={styles.descriptionBody}>
              {description.length > 30 ? `${description.slice(0, 30).trimEnd()}...` : description}
            </Text>
            <View style={styles.descriptionFooter}>
              <Text style={styles.descriptionFooterText}>ko'proq</Text>
            </View>
          </Pressable>
        ) : null}
        {mediaCount > 1 ? (
          <View style={styles.metaItem}>
            <ListVideo size={14} color={Colors.subtleText} />
            <Text style={styles.metaText}>
              {activeMediaIndex + 1}/{mediaCount}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaItemLiked: {
    backgroundColor: "transparent",
  },
  metaText: {
    color: Colors.mutedText,
    fontSize: 13,
    fontWeight: "500",
  },
  metaTextLiked: {
    color: Colors.danger,
  },
  descriptionCard: {
    display: "flex",
    flexDirection: "row",
  },
  descriptionBody: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 21,
  },
  descriptionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: 8,
  },
  descriptionFooterText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
