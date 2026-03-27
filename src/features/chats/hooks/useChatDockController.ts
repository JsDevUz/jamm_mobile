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
  const [keyboardCoveredHeight, setKeyboardCoveredHeight] = useState(0);
  const [composerDockVisible, setComposerDockVisible] = useState(false);
  const [stickerSheetVisible, setStickerSheetVisible] = useState(false);
  const [controlledDockCoveredHeight, setControlledDockCoveredHeight] = useState(0);
  const [stickerSheetOpenedFromKeyboard, setStickerSheetOpenedFromKeyboard] = useState(false);
  const [composerSoftInputEnabled, setComposerSoftInputEnabledState] = useState(true);
  const keyboardVisibleRef = useRef(false);
  const composerDockVisibleRef = useRef(false);
  const stickerSheetVisibleRef = useRef(false);
  const stickerSheetHeightAnim = useRef(new Animated.Value(0)).current;
  const stickerSheetHeightRef = useRef(0);
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

        if (!stickerSheetVisibleRef.current && !composerDockVisibleRef.current) {
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
    const listenerId = stickerSheetHeightAnim.addListener(({ value }) => {
      stickerSheetHeightRef.current = Math.max(0, value || 0);
    });

    return () => {
      stickerSheetHeightAnim.removeListener(listenerId);
    };
  }, [stickerSheetHeightAnim]);

  useEffect(() => {
    composerDockVisibleRef.current = composerDockVisible;
  }, [composerDockVisible]);

  useEffect(() => {
    stickerSheetVisibleRef.current = stickerSheetVisible;
  }, [stickerSheetVisible]);

  useEffect(() => {
    const syncKeyboardVisible = () => {
      const nextVisible =
        keyboardHeightRef.current > 1 || keyboardProgressRef.current > 0.01;
      const nextCoveredHeight = nextVisible
        ? Math.max(
            keyboardHeightRef.current,
            lastOpenedKeyboardHeightRef.current,
          )
        : 0;
      keyboardVisibleRef.current = nextVisible;
      setKeyboardVisibleAnimated(nextVisible);
      setKeyboardCoveredHeight((previous) =>
        previous === nextCoveredHeight ? previous : nextCoveredHeight,
      );
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
    lastOpenedKeyboardHeightRef,
    setKeyboardVisibleAnimated,
  ]);

  const dismissKeyboard = useCallback(() => {
    composerFocusedRef.current = false;
    composerInputRef.current?.blur();
    void KeyboardController.dismiss({ keepFocus: false });
  }, [composerFocusedRef, composerInputRef]);

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

  const resolveStickerSheetHeight = useCallback(() => {
    const measuredKeyboardHeight = Math.max(
      keyboardHeightRef.current,
      lastOpenedKeyboardHeightRef.current,
    );
    const estimatedKeyboardHeight =
      Platform.OS === "ios" ? 336 : 320;

    return Math.max(measuredKeyboardHeight, estimatedKeyboardHeight);
  }, [keyboardHeightRef, lastOpenedKeyboardHeightRef]);
  const resolveStickerSheetMaxHeight = useCallback(() => {
    const minimumHeight = resolveStickerSheetHeight();
    const availableHeight = Math.max(
      minimumHeight,
      screenHeight - topInset - 104,
    );

    return availableHeight;
  }, [resolveStickerSheetHeight, screenHeight, topInset]);

  const animateStickerSheet = useCallback(
    (toValue: number, onComplete?: () => void) => {
      stickerSheetHeightAnim.stopAnimation();
      const isOpening = toValue > stickerSheetHeightRef.current;
      Animated.timing(stickerSheetHeightAnim, {
        toValue,
        duration: isOpening ? 680 : 360,
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
    [stickerSheetHeightAnim, stickerSheetHeightRef],
  );

  const syncDockVisibility = useCallback(
    ({
      composerVisible,
      sheetVisible,
      openedFromKeyboard,
      coveredHeight,
    }: {
      composerVisible: boolean;
      sheetVisible: boolean;
      openedFromKeyboard: boolean;
      coveredHeight: number;
    }) => {
      composerDockVisibleRef.current = composerVisible;
      stickerSheetVisibleRef.current = sheetVisible;
      setComposerDockVisible(composerVisible);
      setStickerSheetVisible(sheetVisible);
      setStickerSheetOpenedFromKeyboard(openedFromKeyboard);
      setControlledDockCoveredHeight(coveredHeight);
    },
    [],
  );

  const raiseControlledDock = useCallback(
    ({
      showSheet = false,
      targetHeight,
      keepKeyboardVisualPosition = false,
      onComplete,
    }: {
      showSheet?: boolean;
      targetHeight?: number;
      keepKeyboardVisualPosition?: boolean;
      onComplete?: () => void;
    } = {}) => {
      const resolvedTargetHeight = targetHeight ?? resolveStickerSheetHeight();
      const hasExistingLift =
        composerDockVisibleRef.current ||
        stickerSheetVisibleRef.current ||
        stickerSheetHeightRef.current > 1;

      clearPendingDockHideFrame();
      syncDockVisibility({
        composerVisible: true,
        sheetVisible: showSheet,
        openedFromKeyboard: showSheet && keepKeyboardVisualPosition,
        coveredHeight: resolvedTargetHeight,
      });

      if (keepKeyboardVisualPosition) {
        stickerSheetHeightAnim.setValue(
          Math.max(keyboardHeightRef.current, resolvedTargetHeight),
        );
      } else if (!hasExistingLift && !showSheet) {
        stickerSheetHeightAnim.setValue(0);
      } else if (!hasExistingLift && showSheet) {
        stickerSheetHeightAnim.setValue(resolvedTargetHeight);
      }

      if (showSheet) {
        disableComposerSoftInput();
        if (keepKeyboardVisualPosition) {
          dismissKeyboard();
        }
      }

      animateStickerSheet(resolvedTargetHeight, onComplete);
    },
    [
      animateStickerSheet,
      clearPendingDockHideFrame,
      disableComposerSoftInput,
      dismissKeyboard,
      keyboardHeightRef,
      resolveStickerSheetHeight,
      syncDockVisibility,
      stickerSheetHeightAnim,
      stickerSheetHeightRef,
    ],
  );

  const lowerControlledDock = useCallback(
    ({
      keepComposerDock = false,
      enableSoftInput = false,
      focusComposer = false,
    }: {
      keepComposerDock?: boolean;
      enableSoftInput?: boolean;
      focusComposer?: boolean;
    } = {}) => {
      const settledHeight = keepComposerDock ? resolveStickerSheetHeight() : 0;

      animateStickerSheet(settledHeight, () => {
        if (!keepComposerDock) {
          stickerSheetHeightAnim.setValue(0);
        }
        clearPendingDockHideFrame();
        dockHideFrameRef.current = requestAnimationFrame(() => {
          dockHideFrameRef.current = null;
          syncDockVisibility({
            composerVisible: keepComposerDock,
            sheetVisible: false,
            openedFromKeyboard: false,
            coveredHeight: settledHeight,
          });
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
      animateStickerSheet,
      clearPendingDockHideFrame,
      composerInputRef,
      enableComposerSoftInput,
      resolveStickerSheetHeight,
      syncDockVisibility,
      stickerSheetHeightAnim,
    ],
  );

  const showComposerDock = useCallback((onComplete?: () => void) => {
    const shouldKeepKeyboardVisualPosition =
      keyboardVisibleRef.current ||
      keyboardHeightRef.current > 1 ||
      keyboardProgressRef.current > 0.01;

    raiseControlledDock({
      showSheet: false,
      keepKeyboardVisualPosition: shouldKeepKeyboardVisualPosition,
      onComplete,
    });
  }, [
    keyboardHeightRef,
    keyboardProgressRef,
    keyboardVisibleRef,
    raiseControlledDock,
  ]);

  const showComposerDockImmediately = useCallback(() => {
    raiseControlledDock({
      showSheet: false,
      targetHeight: resolveStickerSheetHeight(),
      keepKeyboardVisualPosition: false,
      onComplete: undefined,
    });
    stickerSheetHeightAnim.setValue(resolveStickerSheetHeight());
  }, [raiseControlledDock, resolveStickerSheetHeight, stickerSheetHeightAnim]);

  const showStickerSheet = useCallback(() => {
    const shouldKeepKeyboardVisualPosition =
      keyboardVisibleRef.current ||
      keyboardHeightRef.current > 1 ||
      keyboardProgressRef.current > 0.01;
    const targetHeight = shouldKeepKeyboardVisualPosition
      ? Math.max(
          keyboardHeightRef.current > 1 ? keyboardHeightRef.current : 0,
          lastOpenedKeyboardHeightRef.current,
        )
      : resolveStickerSheetHeight();

    raiseControlledDock({
      showSheet: true,
      targetHeight,
      keepKeyboardVisualPosition: shouldKeepKeyboardVisualPosition,
    });
  }, [
    keyboardHeightRef,
    keyboardProgressRef,
    keyboardVisibleRef,
    lastOpenedKeyboardHeightRef,
    raiseControlledDock,
    resolveStickerSheetHeight,
  ]);

  const hideComposerDock = useCallback(() => {
    if (!composerDockVisible) {
      return;
    }

    lowerControlledDock();
  }, [composerDockVisible, lowerControlledDock]);

  const hideStickerSheet = useCallback(
    ({
      enableSoftInput = false,
      focusComposer = false,
    }: {
      enableSoftInput?: boolean;
      focusComposer?: boolean;
    } = {}) => {
      if (!stickerSheetVisible) {
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

      lowerControlledDock({
        keepComposerDock: true,
        enableSoftInput,
        focusComposer,
      });
    },
    [
      enableComposerSoftInput,
      lowerControlledDock,
      stickerSheetVisible,
    ],
  );

  const setStickerSheetHeightImmediate = useCallback(
    (nextHeight: number) => {
      const clampedHeight = Math.max(
        resolveStickerSheetHeight(),
        Math.min(resolveStickerSheetMaxHeight(), nextHeight),
      );

      stickerSheetHeightAnim.stopAnimation();
      stickerSheetHeightAnim.setValue(clampedHeight);
      setControlledDockCoveredHeight(clampedHeight);
    },
    [resolveStickerSheetHeight, resolveStickerSheetMaxHeight, stickerSheetHeightAnim],
  );

  const snapStickerSheetHeight = useCallback(
    (nextHeight: number) => {
      const clampedHeight = Math.max(
        resolveStickerSheetHeight(),
        Math.min(resolveStickerSheetMaxHeight(), nextHeight),
      );

      setControlledDockCoveredHeight(clampedHeight);
      animateStickerSheet(clampedHeight);
    },
    [animateStickerSheet, resolveStickerSheetHeight, resolveStickerSheetMaxHeight],
  );

  const toggleStickerSheet = useCallback(() => {
    if (stickerSheetVisible) {
      hideStickerSheet();
      return;
    }

    showStickerSheet();
  }, [hideStickerSheet, showStickerSheet, stickerSheetVisible]);

  const dockVisible = stickerSheetVisible || composerDockVisible;
  const controlledDockLiftVisible = stickerSheetVisible || composerDockVisible;
  const stickerSheetTranslateY = Animated.multiply(stickerSheetHeightAnim, -1);
  const stickerSheetVisualGap = 2;
  const stickerSheetSafeAreaCompensation = Math.max(
    Math.min(bottomInset - stickerSheetVisualGap, 8),
    0,
  );
  const stickerSheetLiftOffset = Animated.diffClamp(
    Animated.subtract(
      stickerSheetHeightAnim,
      stickerSheetSafeAreaCompensation,
    ),
    0,
    resolveStickerSheetMaxHeight(),
  );
  const controlledDockBottomOffset = stickerSheetVisible &&
    stickerSheetOpenedFromKeyboard
    ? stickerSheetHeightAnim
    : stickerSheetLiftOffset;
  const activeDockTranslateY = stickerSheetVisible
    ? stickerSheetTranslateY
    : composerDockVisible
      ? stickerSheetTranslateY
      : keyboardHeightAnim;
  const messagesViewportTranslateY = stickerSheetVisible || composerDockVisible
    ? stickerSheetTranslateY
    : keyboardMessagesViewportTranslateY;
  const dockCoveredHeight = controlledDockLiftVisible
    ? controlledDockCoveredHeight
    : 0;
  const messagesCoveredBottomInset = controlledDockLiftVisible
    ? dockCoveredHeight
    : keyboardCoveredHeight;
  return {
    keyboardVisible,
    keyboardVisibleRef,
    composerDockVisible,
    controlledDockLiftVisible,
    stickerSheetVisible,
    stickerSheetHeightAnim,
    stickerSheetHeightRef,
    stickerSheetLiftOffset,
    controlledDockBottomOffset,
    stickerSheetInitialHeight: resolveStickerSheetHeight(),
    stickerSheetMaxHeight: resolveStickerSheetMaxHeight(),
    composerSoftInputEnabled,
    enableComposerSoftInput,
    disableComposerSoftInput,
    dismissKeyboard,
    showComposerDock,
    showComposerDockImmediately,
    hideComposerDock,
    showStickerSheet,
    hideStickerSheet,
    toggleStickerSheet,
    setStickerSheetHeightImmediate,
    snapStickerSheetHeight,
    activeDockTranslateY,
    messagesViewportTranslateY,
    messagesCoveredBottomInset,
    shouldKeepMessagesAnchoredToBottom: true,
    lockComposerShellHeight: dockVisible,
    dockBottomSpacerHeight:
      keyboardVisible || dockVisible ? 0 : Math.max(bottomInset, 0),
    composerShellBottomPadding: keyboardVisible ? 6 : dockVisible ? 0 : 0,
  };
}
