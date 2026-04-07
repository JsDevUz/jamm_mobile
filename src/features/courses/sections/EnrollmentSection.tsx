import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PersistentCachedImage } from "../../../components/PersistentCachedImage";
import { Colors } from "../../../theme/colors";

type Props = {
  ownerName: string;
  ownerAvatar?: string | null;
  memberCount: number;
  actionSlot: ReactNode;
};

export function EnrollmentSection({
  ownerName,
  ownerAvatar,
  memberCount,
  actionSlot,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.infoRow}>
        <View style={styles.avatar}>
          {ownerAvatar ? (
            <PersistentCachedImage
              remoteUri={ownerAvatar}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={styles.avatarLetter}>{String(ownerName || "?").charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.meta}>
          <Text style={styles.name}>{ownerName}</Text>
          <Text style={styles.count}>{memberCount} talaba</Text>
        </View>
        <View style={styles.actions}>{actionSlot}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarLetter: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  count: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
});
