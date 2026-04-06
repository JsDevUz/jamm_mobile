import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Search, Plus } from "lucide-react-native";
import { Colors } from "../../theme/colors";

type Props = {
  title: string;
  onPressSearch?: () => void;
  onPressAdd?: () => void;
  addIcon?: ReactNode;
  hideAdd?: boolean;
};

export function SectionTopHeader({
  title,
  onPressSearch,
  onPressAdd,
  addIcon,
  hideAdd = false,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.actions}>
        <Pressable
          style={[styles.iconButton, styles.searchButton]}
          onPress={onPressSearch}
          disabled={!onPressSearch}
        >
          <Search size={20} color={Colors.text} />
        </Pressable>
        {!hideAdd ? (
          <Pressable style={[styles.iconButton, styles.addButton]} onPress={onPressAdd}>
            {addIcon || <Plus size={20} color="#fff" />}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButton: {
    backgroundColor: Colors.input,
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: Colors.primary,
  },
});
