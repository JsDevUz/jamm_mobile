import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  type TextInput as NativeTextInput,
} from "react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { KeyboardController } from "react-native-keyboard-controller";
import { useKeyboardHeight } from "./useKeyboardHeight";

export function useChatDockController({
  bottomInset,
  topInset,
  screenHeight,
  isWeb,
  composerInputRef,
  composerFocusedRef,
}: {
  bottomInset: number;
  topInset: number;
  screenHeight: number;
  isWeb: boolean;
  composerInputRef: RefObject<NativeTextInput | null>;
  composerFocusedRef: MutableRefObject<boolean>;
}) {
  const {
    keyboardHeightAnim,
    keyboardHeightAnim: keyboardMessagesViewportTranslateY,
    keyboardProgressAnim,
    keyboardHeightRef,
    keyboardProgressRef,
    lastOpenedKeyboardHeightRef,
  } = useKeyboardHeight();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [composerDockVisible, setComposerDockVisible] = useState(false);
  const [voiceDockVisible, setVoiceDockVisible] = useState(false);
  const [voiceDockOpenedFromKeyboard, setVoiceDockOpenedFromKeyboard] = useState(false);
  const [composerSoftInputEnabled, setComposerSoftInputEnabledState] = useState(true);
  const keyboardVisibleRef = useRef(false);
  const composerDockVisibleRef = useRef(false);
  const voiceDockVisibleRef = useRef(false);
  const voiceDockHeightAnim = useRef(new Animated.Value(0)).current;
  const voiceDockHeightRef = useRef(0);
  const dockHideFrameRef = useRef<number | null>(null);

  const animateNextLayout = useCallback(() => {
    if (isWeb) {
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [isWeb]);

  const setKeyboardVisibleAnimated = useCallback(
    (nextVisible: boolean) => {
      setKeyboardVisible((previous) => {
        if (previous === nextVisible) {
          return previous;
        }

        if (!voiceDockVisibleRef.current && !composerDockVisibleRef.current) {
          animateNextLayout();
        }
        return nextVisible;
      });
    },
    [animateNextLayout],
  );

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const clearPendingDockHideFrame = useCallback(() => {
    if (dockHideFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(dockHideFrameRef.current);
    dockHideFrameRef.current = null;
  }, []);

  useEffect(() => {
    const listenerId = voiceDockHeightAnim.addListener(({ value }) => {
      voiceDockHeightRef.current = Math.max(0, value || 0);
    });

    return () => {
      voiceDockHeightAnim.removeListener(listenerId);
    };
  }, [voiceDockHeightAnim]);

  useEffect(() => {
    composerDockVisibleRef.current = composerDockVisible;
  }, [composerDockVisible]);

  useEffect(() => {
    voiceDockVisibleRef.current = voiceDockVisible;
  }, [voiceDockVisible]);

  useEffect(() => {
    const syncKeyboardVisible = () => {
      const nextVisible =
        keyboardHeightRef.current > 1 || keyboardProgressRef.current > 0.01;
      keyboardVisibleRef.current = nextVisible;
      setKeyboardVisibleAnimated(nextVisible);
    };

    const heightListenerId = keyboardHeightAnim.addListener(() => {
      syncKeyboardVisible();
    });
    const progressListenerId = keyboardProgressAnim.addListener(() => {
      syncKeyboardVisible();
    });

    syncKeyboardVisible();

    return () => {
      keyboardHeightAnim.removeListener(heightListenerId);
      keyboardProgressAnim.removeListener(progressListenerId);
    };
  }, [
    keyboardHeightAnim,
    keyboardProgressAnim,
    keyboardHeightRef,
    keyboardProgressRef,
    setKeyboardVisibleAnimated,
  ]);

  const dismissKeyboard = useCallback(() => {
    if (composerDockVisibleRef.current && !voiceDockVisibleRef.current) {
      voiceDockHeightAnim.stopAnimation();
      voiceDockHeightAnim.setValue(
        Math.max(
          keyboardHeightRef.current,
          lastOpenedKeyboardHeightRef.current,
        ),
      );
    }

    composerFocusedRef.current = false;
    composerInputRef.current?.blur();
    void KeyboardController.dismiss({ keepFocus: false });
  }, [
    composerFocusedRef,
    composerInputRef,
    keyboardHeightRef,
    lastOpenedKeyboardHeightRef,
    voiceDockHeightAnim,
  ]);

  const enableComposerSoftInput = useCallback(() => {
    composerInputRef.current?.setNativeProps({
      showSoftInputOnFocus: true,
    });
    setComposerSoftInputEnabledState(true);
  }, [composerInputRef]);

  const disableComposerSoftInput = useCallback(() => {
    composerInputRef.current?.setNativeProps({
      showSoftInputOnFocus: false,
    });
    setComposerSoftInputEnabledState(false);
  }, [composerInputRef]);

  const resolveVoiceDockHeight = useCallback(() => {
    const measuredKeyboardHeight = Math.max(
      keyboardHeightRef.current,
      lastOpenedKeyboardHeightRef.current,
    );
    const estimatedKeyboardHeight =
      Platform.OS === "ios" ? 336 : 320;

    return Math.max(measuredKeyboardHeight, estimatedKeyboardHeight);
  }, [keyboardHeightRef, lastOpenedKeyboardHeightRef]);
  const resolveVoiceDockMaxHeight = useCallback(() => {
    const minimumHeight = resolveVoiceDockHeight();
    const availableHeight = Math.max(
      minimumHeight,
      screenHeight - topInset - 104,
    );

    return availableHeight;
  }, [resolveVoiceDockHeight, screenHeight, topInset]);

  const animateVoiceDock = useCallback(
    (toValue: number, onComplete?: () => void) => {
      voiceDockHeightAnim.stopAnimation();
      const isOpening = toValue > voiceDockHeightRef.current;
      Animated.timing(voiceDockHeightAnim, {
        toValue,
        duration: isOpening ? 460 : 360,
        easing: isOpening
          ? Easing.inOut(Easing.cubic)
          : Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        onComplete?.();
      });
    },
    [voiceDockHeightAnim],
  );

  const showComposerDock = useCallback(() => {
    const targetHeight = resolveVoiceDockHeight();
    const shouldKeepKeyboardVisualPosition =
      keyboardVisibleRef.current ||
      keyboardHeightRef.current > 1 ||
      keyboardProgressRef.current > 0.01;

    clearPendingDockHideFrame();
    setVoiceDockOpenedFromKeyboard(false);
    setVoiceDockVisible(false);
    setComposerDockVisible(true);
    voiceDockHeightAnim.setValue(
      shouldKeepKeyboardVisualPosition
        ? Math.max(keyboardHeightRef.current, targetHeight)
        : 0,
    );
    animateVoiceDock(targetHeight);
  }, [
    clearPendingDockHideFrame,
    animateVoiceDock,
    keyboardHeightRef,
    keyboardProgressRef,
    keyboardVisibleRef,
    resolveVoiceDockHeight,
    voiceDockHeightAnim,
  ]);

  const showVoiceDock = useCallback(() => {
    const shouldKeepKeyboardVisualPosition =
      keyboardVisibleRef.current ||
      keyboardHeightRef.current > 1 ||
      keyboardProgressRef.current > 0.01;
    const targetHeight = shouldKeepKeyboardVisualPosition
      ? Math.max(
          keyboardHeightRef.current > 1 ? keyboardHeightRef.current : 0,
          lastOpenedKeyboardHeightRef.current,
        )
      : resolveVoiceDockHeight();

    clearPendingDockHideFrame();
    setVoiceDockOpenedFromKeyboard(shouldKeepKeyboardVisualPosition);
    setComposerDockVisible(false);
    setVoiceDockVisible(true);
    voiceDockHeightAnim.setValue(
      shouldKeepKeyboardVisualPosition ? Math.max(keyboardHeightRef.current, targetHeight) : 0,
    );
    disableComposerSoftInput();
    dismissKeyboard();
    animateVoiceDock(targetHeight);
  }, [
    clearPendingDockHideFrame,
    animateVoiceDock,
    disableComposerSoftInput,
    dismissKeyboard,
    keyboardHeightRef,
    keyboardProgressRef,
    keyboardVisibleRef,
    lastOpenedKeyboardHeightRef,
    resolveVoiceDockHeight,
    voiceDockHeightAnim,
  ]);

  const hideComposerDock = useCallback(() => {
    if (!composerDockVisible) {
      return;
    }

    animateVoiceDock(0, () => {
      voiceDockHeightAnim.setValue(0);
      clearPendingDockHideFrame();
      dockHideFrameRef.current = requestAnimationFrame(() => {
        dockHideFrameRef.current = null;
        setComposerDockVisible(false);
        setVoiceDockOpenedFromKeyboard(false);
      });
    });
  }, [
    animateVoiceDock,
    clearPendingDockHideFrame,
    composerDockVisible,
    voiceDockHeightAnim,
  ]);

  const hideVoiceDock = useCallback(
    ({
      enableSoftInput = false,
      focusComposer = false,
    }: {
      enableSoftInput?: boolean;
      focusComposer?: boolean;
    } = {}) => {
      if (!voiceDockVisible) {
        if (enableSoftInput) {
          enableComposerSoftInput();
          if (focusComposer) {
            requestAnimationFrame(() => {
              composerInputRef.current?.focus();
            });
          }
        }
        return;
      }

      animateVoiceDock(0, () => {
        voiceDockHeightAnim.setValue(0);
        clearPendingDockHideFrame();
        dockHideFrameRef.current = requestAnimationFrame(() => {
          dockHideFrameRef.current = null;
          setComposerDockVisible(false);
          setVoiceDockVisible(false);
          setVoiceDockOpenedFromKeyboard(false);
          if (enableSoftInput) {
            enableComposerSoftInput();
            if (focusComposer) {
              requestAnimationFrame(() => {
                composerInputRef.current?.focus();
              });
            }
          }
        });
      });
    },
    [
      animateVoiceDock,
      clearPendingDockHideFrame,
      composerInputRef,
      enableComposerSoftInput,
      voiceDockHeightAnim,
      voiceDockVisible,
    ],
  );

  const setVoiceDockHeightImmediate = useCallback(
    (nextHeight: number) => {
      const clampedHeight = Math.max(
        resolveVoiceDockHeight(),
        Math.min(resolveVoiceDockMaxHeight(), nextHeight),
      );

      voiceDockHeightAnim.stopAnimation();
      voiceDockHeightAnim.setValue(clampedHeight);
    },
    [resolveVoiceDockHeight, resolveVoiceDockMaxHeight, voiceDockHeightAnim],
  );

  const snapVoiceDockHeight = useCallback(
    (nextHeight: number) => {
      const clampedHeight = Math.max(
        resolveVoiceDockHeight(),
        Math.min(resolveVoiceDockMaxHeight(), nextHeight),
      );

      animateVoiceDock(clampedHeight);
    },
    [animateVoiceDock, resolveVoiceDockHeight, resolveVoiceDockMaxHeight],
  );

  const toggleVoiceDock = useCallback(() => {
    if (voiceDockVisible) {
      hideVoiceDock();
      return;
    }

    showVoiceDock();
  }, [hideVoiceDock, showVoiceDock, voiceDockVisible]);

  const dockVisible = voiceDockVisible || composerDockVisible;
  const controlledDockLiftVisible = voiceDockVisible || composerDockVisible;
  const voiceDockTranslateY = Animated.multiply(voiceDockHeightAnim, -1);
  const composerDockVisualGap = 6;
  const voiceDockVisualGap = 2;
  const composerDockLiftOffset = Animated.diffClamp(
    Animated.subtract(
      voiceDockHeightAnim,
      Math.max(bottomInset - composerDockVisualGap, 0),
    ),
    0,
    resolveVoiceDockMaxHeight(),
  );
  const keyboardDockLiftOffset = Animated.diffClamp(
    Animated.subtract(
      keyboardHeightAnim,
      Math.max(bottomInset - composerDockVisualGap, 0),
    ),
    0,
    resolveVoiceDockMaxHeight(),
  );
  const voiceDockLiftOffset = Animated.diffClamp(
    Animated.subtract(
      voiceDockHeightAnim,
      Math.max(bottomInset - voiceDockVisualGap, 0),
    ),
    0,
    resolveVoiceDockMaxHeight(),
  );
  const controlledDockBottomOffset =
    voiceDockVisible
      ? voiceDockOpenedFromKeyboard
        ? voiceDockHeightAnim
        : voiceDockLiftOffset
      : keyboardVisible
        ? keyboardDockLiftOffset
        : composerDockLiftOffset;
  const activeDockTranslateY = voiceDockVisible
    ? voiceDockTranslateY
    : composerDockVisible
      ? voiceDockTranslateY
      : keyboardHeightAnim;
  const messagesViewportTranslateY = voiceDockVisible || composerDockVisible
    ? voiceDockTranslateY
    : keyboardMessagesViewportTranslateY;
  const keyboardCoveredHeight = keyboardVisible
    ? Math.max(keyboardHeightRef.current, lastOpenedKeyboardHeightRef.current)
    : 0;
  const dockCoveredHeight = controlledDockLiftVisible
    ? voiceDockVisible
      ? voiceDockOpenedFromKeyboard
        ? Math.max(
            voiceDockHeightRef.current,
            keyboardHeightRef.current,
            lastOpenedKeyboardHeightRef.current,
          )
        : Math.max(
            voiceDockHeightRef.current,
            resolveVoiceDockHeight(),
          )
      : keyboardVisible
        ? keyboardCoveredHeight
        : Math.max(
            voiceDockHeightRef.current,
            lastOpenedKeyboardHeightRef.current,
            resolveVoiceDockHeight(),
          )
    : 0;
  const messagesCoveredBottomInset = controlledDockLiftVisible
    ? dockCoveredHeight
    : keyboardCoveredHeight;
  return {
    keyboardVisible,
    keyboardVisibleRef,
    composerDockVisible,
    controlledDockLiftVisible,
    voiceDockVisible,
    voiceDockHeightAnim,
    voiceDockHeightRef,
    voiceDockLiftOffset,
    controlledDockBottomOffset,
    voiceDockInitialHeight: resolveVoiceDockHeight(),
    voiceDockMaxHeight: resolveVoiceDockMaxHeight(),
    composerSoftInputEnabled,
    enableComposerSoftInput,
    disableComposerSoftInput,
    dismissKeyboard,
    showComposerDock,
    hideComposerDock,
    showVoiceDock,
    hideVoiceDock,
    toggleVoiceDock,
    setVoiceDockHeightImmediate,
    snapVoiceDockHeight,
    activeDockTranslateY,
    messagesViewportTranslateY,
    messagesCoveredBottomInset,
    shouldKeepMessagesAnchoredToBottom: true,
    lockComposerShellHeight: dockVisible,
    dockBottomSpacerHeight:
      keyboardVisible || dockVisible ? 0 : Math.max(bottomInset, 0),
    composerShellBottomPadding: keyboardVisible ? 6 : dockVisible ? 2 : 0,
  };
}
