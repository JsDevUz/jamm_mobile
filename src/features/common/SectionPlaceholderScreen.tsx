import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomNav } from "../../components/BottomNav";
import type { MainTabScreenProps } from "../../navigation/types";
import { Colors } from "../../theme/colors";

type RouteName = "Feed" | "Articles" | "Courses" | "Profile";

type Props = MainTabScreenProps<RouteName>;

const contentMap: Record<
  RouteName,
  { title: string; description: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  Feed: {
    title: "Feed",
    description: "Frontend’dagi feed sahifasi keyingi bosqichda shu yerga ko'chadi.",
    icon: "flame-outline",
  },
  Articles: {
    title: "Articles",
    description:
      "Frontend’dagi article reader va sidebar native ko'rinishda shu yerga ulanadi.",
    icon: "newspaper-outline",
  },
  Courses: {
    title: "Courses",
    description: "Course sidebar va player oqimi frontend bilan moslab ko'chiriladi.",
    icon: "school-outline",
  },
  Profile: {
    title: "Profile",
    description:
      "Profile page va utility panel keyingi iteratsiyada mobile 1:1 qilinadi.",
    icon: "person-outline",
  },
};

export function SectionPlaceholderScreen({ navigation, route }: Props) {
  const content = contentMap[route.name];

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Ionicons name={content.icon} size={34} color={Colors.primary} />
          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.description}>{content.description}</Text>
        </View>

        <BottomNav activeRoute={route.name} navigation={navigation} />
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
    backgroundColor: Colors.background,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 14,
  },
  description: {
    color: Colors.mutedText,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 10,
  },
});
