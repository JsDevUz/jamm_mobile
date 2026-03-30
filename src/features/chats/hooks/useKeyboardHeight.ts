import { useEffect, useRef } from "react";
import {
  KeyboardEvents,
  useKeyboardAnimation,
} from "react-native-keyboard-controller";

export function useKeyboardHeight() {
  const { height: keyboardHeightAnim, progress: keyboardProgressAnim } =
    useKeyboardAnimation();
  const keyboardTranslateYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const keyboardProgressRef = useRef(0);
  const keyboardTargetHeightRef = useRef(0);
  const keyboardAnimationDurationRef = useRef(0);
  const lastOpenedKeyboardHeightRef = useRef(0);

  useEffect(() => {
    const heightListenerId = keyboardHeightAnim.addListener(({ value }) => {
      const nextTranslateY = value || 0;
      const nextHeight = Math.max(0, Math.abs(nextTranslateY));
      keyboardTranslateYRef.current = nextTranslateY;
      keyboardHeightRef.current = nextHeight;
      if (nextHeight > 0) {
        lastOpenedKeyboardHeightRef.current = nextHeight;
      }
    });
    const progressListenerId = keyboardProgressAnim.addListener(({ value }) => {
      keyboardProgressRef.current = Math.max(0, value || 0);
    });

    return () => {
      keyboardHeightAnim.removeListener(heightListenerId);
      keyboardProgressAnim.removeListener(progressListenerId);
    };
  }, [keyboardHeightAnim, keyboardProgressAnim]);

  useEffect(() => {
    const keyboardWillShowSubscription = KeyboardEvents.addListener(
      "keyboardWillShow",
      (event) => {
        const nextHeight = Math.max(0, Number(event?.height) || 0);
        const nextDuration = Math.max(0, Number(event?.duration) || 0);

        if (nextHeight > 0) {
          keyboardTargetHeightRef.current = nextHeight;
          lastOpenedKeyboardHeightRef.current = nextHeight;
        }
        if (nextDuration > 0) {
          keyboardAnimationDurationRef.current = nextDuration;
        }
      },
    );
    const keyboardDidShowSubscription = KeyboardEvents.addListener(
      "keyboardDidShow",
      (event) => {
        const nextHeight = Math.max(0, Number(event?.height) || 0);
        const nextDuration = Math.max(0, Number(event?.duration) || 0);

        if (nextHeight > 0) {
          keyboardTargetHeightRef.current = nextHeight;
          lastOpenedKeyboardHeightRef.current = nextHeight;
        }
        if (nextDuration > 0) {
          keyboardAnimationDurationRef.current = nextDuration;
        }
      },
    );
    const keyboardDidHideSubscription = KeyboardEvents.addListener(
      "keyboardDidHide",
      () => {
        keyboardTargetHeightRef.current = 0;
      },
    );

    return () => {
      keyboardWillShowSubscription.remove();
      keyboardDidShowSubscription.remove();
      keyboardDidHideSubscription.remove();
    };
  }, []);

  return {
    keyboardHeightAnim,
    keyboardProgressAnim,
    keyboardTranslateYRef,
    keyboardHeightRef,
    keyboardProgressRef,
    keyboardTargetHeightRef,
    keyboardAnimationDurationRef,
    lastOpenedKeyboardHeightRef,
  };
}
