import { forwardRef } from "react";
import {
  Platform,
  StyleSheet,
  TextInput as NativeTextInput,
  type TextInputProps,
} from "react-native";
import { Colors } from "../theme/colors";

const webInputReset = {
  outlineWidth: 0,
  outlineStyle: "none",
  outlineColor: "transparent",
  boxShadow: "none",
};

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(
  ({ style, selectionColor, cursorColor, ...props }, ref) => (
    <NativeTextInput
      ref={ref}
      {...props}
      underlineColorAndroid="transparent"
      selectionColor={selectionColor ?? Colors.primary}
      cursorColor={cursorColor ?? Colors.primary}
      style={[
        styles.reset,
        Platform.OS === "web" ? (webInputReset as unknown as object) : null,
        style,
      ]}
    />
  ),
);

TextInput.displayName = "TextInput";

const styles = StyleSheet.create({
  reset: {
    borderWidth: 0,
  },
});
