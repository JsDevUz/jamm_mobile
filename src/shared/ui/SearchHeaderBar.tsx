import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TextInput } from "../../components/TextInput";
import { Colors } from "../../theme/colors";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  rightSlot?: ReactNode;
};

export function SearchHeaderBar({ value, onChangeText, placeholder, rightSlot }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.searchShell}>
        <Ionicons name="search-outline" size={16} color={Colors.subtleText} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.subtleText}
          style={styles.searchInput}
        />
      </View>
      {rightSlot ? <View style={styles.actions}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: Colors.surface,
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
  },
  searchShell: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
