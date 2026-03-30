import type { RefObject } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TextInput } from "../../../components/TextInput";
import { Colors } from "../../../theme/colors";
import type { NormalizedMessage } from "../../../utils/chat";

export function ChatComposer({
  styles,
  composerInputRef,
  composerHeight,
  lockComposerShellHeight,
  composerShellBottomPadding,
  dockBottomSpacerHeight,
  composerContentMessage,
  editingMessageId,
  draft,
  isComposerDisabled,
  composerSoftInputEnabled,
  hasComposerText,
  stickerPickerOpen,
  isSending,
  onChangeDraft,
  onSelectionChange,
  onPressIn,
  onFocus,
  onBlur,
  onAttach,
  onSend,
  onStickerToggle,
  onKeyboardToggle,
  onVoice,
  onClearComposerMode,
  onContextPress,
  onComposerLayout,
}: {
  styles: Record<string, any>;
  composerInputRef: RefObject<any>;
  composerHeight: number;
  lockComposerShellHeight: boolean;
  composerShellBottomPadding: number;
  dockBottomSpacerHeight: number;
  composerContentMessage: NormalizedMessage | null;
  editingMessageId: string | null;
  draft: string;
  isComposerDisabled: boolean;
  composerSoftInputEnabled: boolean;
  hasComposerText: boolean;
  stickerPickerOpen: boolean;
  isSending: boolean;
  onChangeDraft: (value: string) => void;
  onSelectionChange: (event: any) => void;
  onPressIn: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onAttach: () => void;
  onSend: () => void;
  onStickerToggle: () => void;
  onKeyboardToggle: () => void;
  onVoice: () => void;
  onClearComposerMode: () => void;
  onContextPress: () => void;
  onComposerLayout: (height: number) => void;
}) {
  return (
    <View>
      <Animated.View
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height || 0);
          onComposerLayout(nextHeight);
        }}
        style={[
          styles.composerShell,
          {
            height: lockComposerShellHeight ? composerHeight : undefined,
            paddingBottom: composerShellBottomPadding,
          },
        ]}
      >
        <View style={styles.composerStack}>
          {composerContentMessage ? (
            <Pressable style={styles.composerContextCard} onPress={onContextPress}>
              <View style={styles.composerContextTextWrap}>
                <Text style={styles.composerContextLabel}>
                  {editingMessageId ? "Tahrirlanmoqda" : composerContentMessage.senderName}
                </Text>
                <Text style={styles.composerContextText} numberOfLines={1}>
                  {composerContentMessage.content}
                </Text>
              </View>
              <Pressable onPress={onClearComposerMode} style={styles.composerContextClose}>
                <Ionicons name="close" size={16} color={Colors.mutedText} />
              </Pressable>
            </Pressable>
          ) : null}

          <View style={styles.composerRow}>
            <Pressable
              style={({ pressed }) => [
                styles.composerActionButton,
                pressed && styles.composerActionButtonPressed,
                isComposerDisabled && styles.composerActionButtonDisabled,
              ]}
              disabled={isComposerDisabled}
              onPress={onAttach}
            >
              <Ionicons name="image-outline" size={20} color={Colors.mutedText} />
            </Pressable>

            <View style={styles.composerField}>
              <View style={styles.composerInputWrap} onTouchStart={onPressIn}>
                <TextInput
                  ref={composerInputRef}
                  style={styles.composerInput}
                  value={draft}
                  onChangeText={onChangeDraft}
                  onSelectionChange={onSelectionChange}
                  placeholder={
                    isComposerDisabled
                      ? "Suhbat yuklanmoqda..."
                      : editingMessageId
                        ? "Xabarni tahrirlash..."
                        : "Xabar..."
                  }
                  placeholderTextColor={Colors.mutedText}
                  multiline
                  maxLength={3000}
                  editable={!isComposerDisabled}
                  showSoftInputOnFocus={composerSoftInputEnabled}
                  caretHidden={!composerSoftInputEnabled}
                  onPressIn={onPressIn}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                {stickerPickerOpen ? (
                  <Pressable
                    onPress={onKeyboardToggle}
                    style={localStyles.inputTapShield}
                  />
                ) : null}
              </View>

              <View style={styles.composerSideRight}>
                <Pressable
                  onPress={stickerPickerOpen ? onKeyboardToggle : onStickerToggle}
                  style={({ pressed }) => [
                    styles.composerInlineAccessoryButton,
                    stickerPickerOpen && styles.composerInlineAccessoryButtonActive,
                    pressed && styles.composerInlineAccessoryButtonPressed,
                    isComposerDisabled && styles.composerInlineAccessoryButtonDisabled,
                  ]}
                  disabled={isComposerDisabled}
                >
                  <Ionicons
                    name={stickerPickerOpen ? "keypad-outline" : "happy-outline"}
                    size={18}
                    color={stickerPickerOpen ? "#fff" : Colors.mutedText}
                  />
                </Pressable>

                {hasComposerText || editingMessageId ? (
                  <Pressable
                    onPress={onSend}
                    style={({ pressed }) => [
                      styles.composerInlineSendButton,
                      pressed && styles.composerInlineSendButtonPressed,
                      ((!hasComposerText && Boolean(editingMessageId)) ||
                        isSending ||
                        isComposerDisabled) &&
                        styles.composerInlineSendButtonDisabled,
                    ]}
                    disabled={
                      (!hasComposerText && Boolean(editingMessageId)) ||
                      isSending ||
                      isComposerDisabled
                    }
                  >
                    {isSending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons
                        name={editingMessageId ? "checkmark" : "send"}
                        size={15}
                        color="#fff"
                      />
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>

            {!hasComposerText && !editingMessageId ? (
              <Pressable
                onPress={onVoice}
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && styles.sendButtonPressed,
                  (isSending || isComposerDisabled) && styles.sendButtonDisabled,
                ]}
                disabled={isSending || isComposerDisabled}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="mic" size={18} color="#fff" />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </Animated.View>
      <View style={{ height: dockBottomSpacerHeight }} />
    </View>
  );
}

const localStyles = StyleSheet.create({
  inputTapShield: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
});
