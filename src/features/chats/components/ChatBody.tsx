import { Animated } from "react-native";
import { ChatList } from "./ChatList";
import { ChatComposer } from "./ChatComposer";
import { VoiceDockSheet } from "./VoiceDockSheet";

export function ChatBody({
  styles,
  chatBodyTransformStyle,
  messagesViewportInsetStyle,
  messagesViewportTransformStyle,
  listProps,
  composerProps,
  composerTranslateStyle,
  voiceDockProps,
}: {
  styles: Record<string, any>;
  chatBodyTransformStyle?: any;
  messagesViewportInsetStyle?: any;
  messagesViewportTransformStyle?: any;
  listProps: any;
  composerProps: any;
  composerTranslateStyle?: any;
  voiceDockProps?: any;
}) {
  return (
    <Animated.View style={[styles.chatBody, chatBodyTransformStyle]}>
      <ChatList
        {...listProps}
        styles={styles}
        containerInsetStyle={messagesViewportInsetStyle}
        containerTransformStyle={messagesViewportTransformStyle}
      />
      <Animated.View style={[styles.composerStickyHost, composerTranslateStyle]}>
        <ChatComposer {...composerProps} styles={styles} />
      </Animated.View>
      {voiceDockProps ? <VoiceDockSheet {...voiceDockProps} /> : null}
    </Animated.View>
  );
}
