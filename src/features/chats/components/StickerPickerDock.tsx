import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { CHAT_EMOJI_SECTIONS } from "../constants/emojis";

export function StickerPickerDock({
  styles,
  pickerHeightSharedValue,
  stickerPickerVisible,
  composerHeight,
  bottomInset,
  onPressSticker,
}: {
  styles: Record<string, any>;
  pickerHeightSharedValue: SharedValue<number>;
  stickerPickerVisible: boolean;
  composerHeight: number;
  bottomInset: number;
  onPressSticker: (sticker: string) => void;
}) {
  const animatedHeightStyle = useAnimatedStyle(() => ({
    height: pickerHeightSharedValue.value,
  }));

  return (
    <Animated.View style={[styles.stickerPickerDock, animatedHeightStyle]}>
      {stickerPickerVisible ? (
        <ScrollView
          contentContainerStyle={[
            styles.stickerPickerContent,
            { paddingBottom: composerHeight + Math.max(bottomInset, 16) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {CHAT_EMOJI_SECTIONS.map((section) => (
            <View key={section.label} style={styles.emojiSection}>
              <Text style={styles.emojiSectionLabel}>{section.label}</Text>
              <View style={styles.emojiGrid}>
                {section.emojis.map((emoji, index) => (
                  <Pressable
                    key={`${section.label}-${emoji}-${index}`}
                    style={({ pressed }) => [
                      styles.emojiButton,
                      pressed && styles.emojiButtonPressed,
                    ]}
                    onPress={() => onPressSticker(emoji)}
                  >
                    <Text style={styles.emojiButtonText}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Animated.View>
  );
}
