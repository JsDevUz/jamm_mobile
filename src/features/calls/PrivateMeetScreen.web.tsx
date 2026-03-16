import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../navigation/types";
import { Colors } from "../../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "PrivateMeet">;

export function PrivateMeetScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        <Text style={styles.title}>Private meet web’da ishlamaydi</Text>
        <Text style={styles.subtitle}>
          Bu oqim native WebRTC bilan qurildi. Uni iOS/Android dev build’da oching.
        </Text>
        <Pressable style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Orqaga</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: Colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  button: {
    minHeight: 46,
    minWidth: 120,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
