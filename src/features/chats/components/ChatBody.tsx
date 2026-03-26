import { Animated } from "react-native";
import { ChatList } from "./ChatList";
import { StickerPickerDock } from "./StickerPickerDock";
import { ChatComposer } from "./ChatComposer";

export function ChatBody({
  styles,
  chatBodyTransformStyle,
  messagesViewportInsetStyle,
  messagesViewportTransformStyle,
  listProps,
  stickerProps,
  composerProps,
  composerTranslateStyle,
}: {
  styles: Record<string, any>;
  chatBodyTransformStyle?: any;
  messagesViewportInsetStyle?: any;
  messagesViewportTransformStyle?: any;
  listProps: any;
  stickerProps: any;
  composerProps: any;
  composerTranslateStyle?: any;
}) {
  return (
    <Animated.View style={[styles.chatBody, chatBodyTransformStyle]}>
      <ChatList
        {...listProps}
        styles={styles}
        containerInsetStyle={messagesViewportInsetStyle}
        containerTransformStyle={messagesViewportTransformStyle}
      />
      <StickerPickerDock {...stickerProps} styles={styles} />
      <Animated.View style={[styles.composerStickyHost, composerTranslateStyle]}>
        <ChatComposer {...composerProps} styles={styles} />
      </Animated.View>
    </Animated.View>
  );
}
