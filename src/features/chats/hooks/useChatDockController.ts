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
import { AndroidSoftInputModes, KeyboardController } from "react-native-keyboard-controller";
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
  const liftedDockGap = 10;
  const {
    keyboardHeightAnim,
    keyboardHeightAnim: keyboardMessagesViewportTranslateY,
    keyboardProgressAnim,
    keyboardHeightRef,
    keyboardProgressRef,
    keyboardTargetHeightRef,
    keyboardAnimationDurationRef,
    lastOpenedKeyboardHeightRef,
  } = useKeyboardHeight();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardCoveredHeight, setKeyboardCoveredHeight] = useState(0);
  const [composerDockVisible, setComposerDockVisible] = useState(false);
  const [stickerSheetVisible, setStickerSheetVisible] = useState(false);
  const [controlledDockCoveredHeight, setControlledDockCoveredHeight] = useState(0);
  const [composerContentLiftHeight, setComposerContentLiftHeight] = useState(0);
  const [stickerSheetOpenedFromKeyboard, setStickerSheetOpenedFromKeyboard] = useState(false);
  const [composerSoftInputEnabled, setComposerSoftInputEnabledState] = useState(true);
  const keyboardVisibleRef = useRef(false);
  const composerDockVisibleRef = useRef(false);
  const stickerSheetVisibleRef = useRef(false);
  const keyboardComposerHandoffActiveRef = useRef(false);
  const keyboardComposerHandoffStartHeightRef = useRef(0);
  const stickerToKeyboardHandoffRef = useRef(false);
  const pendingKeyboardShowRef = useRef(false);
  const pendingKeyboardShowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const zeroDockTranslateAnim = useRef(new Animated.Value(0)).current;
  const stableBottomInsetRef = useRef(bottomInset);
  const composerContentLiftAnim = useRef(new Animated.Value(0)).current;
  const composerContentLiftHeightRef = useRef(0);
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
  
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    if (stickerSheetVisible || composerDockVisible) {
      KeyboardController.setInputMode(
        AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING,
      );
    } else {
      KeyboardController.setDefaultMode();
    }

    return () => {
      KeyboardController.setDefaultMode();
    };
  }, [composerDockVisible, stickerSheetVisible]);

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
    const listenerId = composerContentLiftAnim.addListener(({ value }) => {
      composerContentLiftHeightRef.current = Math.max(0, value || 0);
    });

    return () => {
      composerContentLiftAnim.removeListener(listenerId);
    };
  }, [composerContentLiftAnim]);

  useEffect(() => {
    composerDockVisibleRef.current = composerDockVisible;
  }, [composerDockVisible]);

  useEffect(() => {
    stickerSheetVisibleRef.current = stickerSheetVisible;
  }, [stickerSheetVisible]);

  useEffect(() => {
    return () => {
      if (pendingKeyboardShowTimeoutRef.current) {
        clearTimeout(pendingKeyboardShowTimeoutRef.current);
        pendingKeyboardShowTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!keyboardVisible && !composerDockVisible && !stickerSheetVisible) {
      stableBottomInsetRef.current = bottomInset;
    }
  }, [bottomInset, composerDockVisible, keyboardVisible, stickerSheetVisible]);

  useEffect(() => {
    const syncKeyboardVisible = () => {
      const nextVisible =
        keyboardHeightRef.current > 1 || keyboardProgressRef.current > 0.01;
      const nextCoveredHeight = nextVisible
        ? Math.max(0, keyboardHeightRef.current)
        : 0;
      keyboardVisibleRef.current = nextVisible;
      setKeyboardVisibleAnimated(nextVisible);
      setKeyboardCoveredHeight((previous) =>
        previous === nextCoveredHeight ? previous : nextCoveredHeight,
      );
      if (
        nextVisible &&
        stickerToKeyboardHandoffRef.current &&
        composerDockVisibleRef.current &&
        !stickerSheetVisibleRef.current
      ) {
        if (pendingKeyboardShowRef.current) {
          pendingKeyboardShowRef.current = false;
          if (pendingKeyboardShowTimeoutRef.current) {
            clearTimeout(pendingKeyboardShowTimeoutRef.current);
            pendingKeyboardShowTimeoutRef.current = null;
          }
        }
        if (!keyboardComposerHandoffActiveRef.current) {
          keyboardComposerHandoffActiveRef.current = true;
          keyboardComposerHandoffStartHeightRef.current = Math.max(
            stickerSheetHeightRef.current,
            nextCoveredHeight,
          );
        }

        const handoffProgress = Math.max(
          0,
          Math.min(1, keyboardProgressRef.current || 0),
        );
        const handoffStartHeight = keyboardComposerHandoffStartHeightRef.current;
        const nextDockHeight =
          handoffStartHeight +
          (nextCoveredHeight - handoffStartHeight) * handoffProgress;

        if (Math.abs(nextDockHeight - stickerSheetHeightRef.current) > 0.5) {
          stickerSheetHeightAnim.setValue(nextDockHeight);
        }
        setControlledDockCoveredHeight((previous) =>
          previous === nextDockHeight ? previous : nextDockHeight,
        );
        if (handoffProgress >= 0.98) {
          keyboardComposerHandoffActiveRef.current = false;
          keyboardComposerHandoffStartHeightRef.current = 0;
          stickerToKeyboardHandoffRef.current = false;
          stickerSheetHeightAnim.setValue(nextCoveredHeight);
          setControlledDockCoveredHeight((previous) =>
            previous === nextCoveredHeight ? previous : nextCoveredHeight,
          );
        }
      } else if (!nextVisible) {
        if (!pendingKeyboardShowRef.current) {
          keyboardComposerHandoffActiveRef.current = false;
          keyboardComposerHandoffStartHeightRef.current = 0;
          stickerToKeyboardHandoffRef.current = false;
        }
      }
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
  const resolveComposerDockHeight = useCallback(() => {
    const measuredKeyboardHeight = Math.max(
      keyboardHeightRef.current,
      keyboardTargetHeightRef.current,
      lastOpenedKeyboardHeightRef.current,
      0,
    );

    if (measuredKeyboardHeight <= 0) {
      return resolveStickerSheetHeight();
    }

    return Math.max(
      measuredKeyboardHeight,
      0,
    );
  }, [
    keyboardHeightRef,
    keyboardTargetHeightRef,
    lastOpenedKeyboardHeightRef,
    resolveStickerSheetHeight,
  ]);
  const resolveStickerSheetMaxHeight = useCallback(() => {
    const minimumHeight = resolveStickerSheetHeight();
    const availableHeight = Math.max(
      minimumHeight,
      screenHeight - topInset - 104,
    );

    return availableHeight;
  }, [resolveStickerSheetHeight, screenHeight, topInset]);

  const animateStickerSheet = useCallback(
    (
      toValue: number,
      onComplete?: () => void,
      durationOverride?: number,
    ) => {
      stickerSheetHeightAnim.stopAnimation();
      const isOpening = toValue > stickerSheetHeightRef.current;
      Animated.timing(stickerSheetHeightAnim, {
        toValue,
        duration:
          durationOverride && durationOverride > 0
            ? durationOverride
            : isOpening
              ? 680
              : 360,
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

  const setComposerAndContentLiftImmediate = useCallback(
    (nextHeight: number) => {
      const clampedHeight = Math.max(0, nextHeight);
      composerContentLiftHeightRef.current = clampedHeight;
      setComposerContentLiftHeight(clampedHeight);
      composerContentLiftAnim.stopAnimation();
      composerContentLiftAnim.setValue(clampedHeight);
    },
    [composerContentLiftAnim],
  );

  const animateComposerAndContentLift = useCallback(
    (nextHeight: number, durationOverride?: number) => {
      const clampedHeight = Math.max(0, nextHeight);
      const previousHeight = composerContentLiftHeightRef.current;
      composerContentLiftHeightRef.current = clampedHeight;
      setComposerContentLiftHeight(clampedHeight);
      composerContentLiftAnim.stopAnimation();
      Animated.timing(composerContentLiftAnim, {
        toValue: clampedHeight,
        duration:
          durationOverride && durationOverride > 0
            ? durationOverride
            : clampedHeight > previousHeight
              ? 420
              : 280,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [composerContentLiftAnim],
  );

  const moveComposerAndContentUp = useCallback(
    (nextHeight?: number, durationOverride?: number) => {
      animateComposerAndContentLift(
        Math.max(0, nextHeight ?? resolveComposerDockHeight()),
        durationOverride,
      );
    },
    [animateComposerAndContentLift, resolveComposerDockHeight],
  );

  const moveComposerAndContentDown = useCallback(
    (durationOverride?: number) => {
      animateComposerAndContentLift(0, durationOverride);
    },
    [animateComposerAndContentLift],
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
      durationOverride,
    }: {
      showSheet?: boolean;
      targetHeight?: number;
      keepKeyboardVisualPosition?: boolean;
      onComplete?: () => void;
      durationOverride?: number;
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
      } else if (!hasExistingLift) {
        stickerSheetHeightAnim.setValue(0);
      }

      if (showSheet) {
        disableComposerSoftInput();
        if (keepKeyboardVisualPosition || Platform.OS === "android") {
          dismissKeyboard();
        }
      }

      moveComposerAndContentUp(resolvedTargetHeight, durationOverride);
      animateStickerSheet(resolvedTargetHeight, onComplete, durationOverride);
    },
    [
      animateStickerSheet,
      clearPendingDockHideFrame,
      disableComposerSoftInput,
      dismissKeyboard,
      keyboardHeightRef,
      moveComposerAndContentUp,
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
      onSettled,
    }: {
      keepComposerDock?: boolean;
      enableSoftInput?: boolean;
      focusComposer?: boolean;
      onSettled?: () => void;
    } = {}) => {
      const settledHeight = keepComposerDock ? resolveStickerSheetHeight() : 0;

      if (keepComposerDock) {
        moveComposerAndContentUp(settledHeight, 260);
      } else {
        moveComposerAndContentDown();
      }

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
          onSettled?.();
        });
      });
    },
    [
      animateStickerSheet,
      clearPendingDockHideFrame,
      composerInputRef,
      enableComposerSoftInput,
      moveComposerAndContentDown,
      moveComposerAndContentUp,
      resolveStickerSheetHeight,
      syncDockVisibility,
      stickerSheetHeightAnim,
    ],
  );

  const showComposerDock = useCallback((onComplete?: () => void) => {
    const shouldKeepKeyboardVisualPosition =
      keyboardVisibleRef.current || stickerToKeyboardHandoffRef.current;
    const isFirstKeyboardLift =
      composerContentLiftHeightRef.current > 0.5 &&
      !keyboardVisibleRef.current &&
      !stickerToKeyboardHandoffRef.current;
    raiseControlledDock({
      showSheet: false,
      targetHeight: resolveComposerDockHeight(),
      keepKeyboardVisualPosition: shouldKeepKeyboardVisualPosition,
      onComplete,
      durationOverride:
        isFirstKeyboardLift
          ? 220
          : keyboardAnimationDurationRef.current > 0
          ? Math.max(
              keyboardAnimationDurationRef.current + 200,
              Platform.OS === "ios" ? 520 : 380,
            )
          : Platform.OS === "ios"
            ? 520
            : 380,
    });
  }, [
    composerContentLiftHeightRef,
    keyboardAnimationDurationRef,
    keyboardVisibleRef,
    raiseControlledDock,
    resolveComposerDockHeight,
    stickerToKeyboardHandoffRef,
  ]);

  const showComposerDockImmediately = useCallback(() => {
    const nextHeight = resolveStickerSheetHeight();
    syncDockVisibility({
      composerVisible: true,
      sheetVisible: false,
      openedFromKeyboard: false,
      coveredHeight: nextHeight,
    });
    setControlledDockCoveredHeight(nextHeight);
    setComposerAndContentLiftImmediate(nextHeight);
  }, [
    resolveStickerSheetHeight,
    setComposerAndContentLiftImmediate,
    syncDockVisibility,
  ]);

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

      if (enableSoftInput) {
        stickerToKeyboardHandoffRef.current = true;
        pendingKeyboardShowRef.current = true;
        if (pendingKeyboardShowTimeoutRef.current) {
          clearTimeout(pendingKeyboardShowTimeoutRef.current);
        }
        pendingKeyboardShowTimeoutRef.current = setTimeout(() => {
          pendingKeyboardShowRef.current = false;
          pendingKeyboardShowTimeoutRef.current = null;
        }, 900);
        clearPendingDockHideFrame();
        const currentHeight = Math.max(
          stickerSheetHeightRef.current,
          controlledDockCoveredHeight,
          0,
        );
        setComposerAndContentLiftImmediate(currentHeight);
        syncDockVisibility({
          composerVisible: true,
          sheetVisible: false,
          openedFromKeyboard: false,
          coveredHeight: currentHeight,
        });
        setControlledDockCoveredHeight((previous) =>
          previous === currentHeight ? previous : currentHeight,
        );
        enableComposerSoftInput();
        if (focusComposer) {
          requestAnimationFrame(() => {
            composerInputRef.current?.focus();
          });
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
      clearPendingDockHideFrame,
      enableComposerSoftInput,
      lowerControlledDock,
      controlledDockCoveredHeight,
      setComposerAndContentLiftImmediate,
      setControlledDockCoveredHeight,
      stickerSheetHeightRef,
      stickerSheetVisible,
      syncDockVisibility,
    ],
  );

  const switchStickerToKeyboard = useCallback(() => {
    composerFocusedRef.current = false;
    composerInputRef.current?.blur();

    if (!stickerSheetVisibleRef.current) {
      enableComposerSoftInput();
      requestAnimationFrame(() => {
        composerInputRef.current?.focus();
      });
      return;
    }

    const currentHeight = Math.max(
      stickerSheetHeightRef.current,
      controlledDockCoveredHeight,
      resolveStickerSheetHeight(),
      0,
    );

    stickerToKeyboardHandoffRef.current = true;
    pendingKeyboardShowRef.current = true;
    if (pendingKeyboardShowTimeoutRef.current) {
      clearTimeout(pendingKeyboardShowTimeoutRef.current);
    }
    pendingKeyboardShowTimeoutRef.current = setTimeout(() => {
      pendingKeyboardShowRef.current = false;
      pendingKeyboardShowTimeoutRef.current = null;
    }, 900);

    clearPendingDockHideFrame();
    setComposerAndContentLiftImmediate(currentHeight);
    syncDockVisibility({
      composerVisible: true,
      sheetVisible: false,
      openedFromKeyboard: false,
      coveredHeight: currentHeight,
    });
    setControlledDockCoveredHeight((previous) =>
      previous === currentHeight ? previous : currentHeight,
    );

    enableComposerSoftInput();
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }, [
    clearPendingDockHideFrame,
    composerFocusedRef,
    composerInputRef,
    controlledDockCoveredHeight,
    enableComposerSoftInput,
    resolveStickerSheetHeight,
    setComposerAndContentLiftImmediate,
    setControlledDockCoveredHeight,
    stickerSheetHeightRef,
    stickerSheetVisibleRef,
    syncDockVisibility,
  ]);

  const setStickerSheetHeightImmediate = useCallback(
    (nextHeight: number) => {
      const clampedHeight = Math.max(
        resolveStickerSheetHeight(),
        Math.min(resolveStickerSheetMaxHeight(), nextHeight),
      );

      setComposerAndContentLiftImmediate(clampedHeight);
      stickerSheetHeightAnim.stopAnimation();
      stickerSheetHeightAnim.setValue(clampedHeight);
      setControlledDockCoveredHeight(clampedHeight);
    },
    [
      resolveStickerSheetHeight,
      resolveStickerSheetMaxHeight,
      setComposerAndContentLiftImmediate,
      stickerSheetHeightAnim,
    ],
  );

  const snapStickerSheetHeight = useCallback(
    (nextHeight: number) => {
      const clampedHeight = Math.max(
        resolveStickerSheetHeight(),
        Math.min(resolveStickerSheetMaxHeight(), nextHeight),
      );

      moveComposerAndContentUp(clampedHeight, 320);
      setControlledDockCoveredHeight(clampedHeight);
      animateStickerSheet(clampedHeight);
    },
    [
      animateStickerSheet,
      moveComposerAndContentUp,
      resolveStickerSheetHeight,
      resolveStickerSheetMaxHeight,
    ],
  );

  const toggleStickerSheet = useCallback(() => {
    if (stickerSheetVisible) {
      hideStickerSheet();
      return;
    }

    showStickerSheet();
  }, [hideStickerSheet, showStickerSheet, stickerSheetVisible]);

  const dockVisible =
    stickerSheetVisible || composerDockVisible || composerContentLiftHeight > 0.5;
  const controlledDockLiftVisible =
    composerContentLiftHeight > 0.5;
  const stickerSheetTranslateY = Animated.multiply(stickerSheetHeightAnim, -1);
  const stickerSheetLiftOffset = Animated.diffClamp(
    Animated.subtract(
      stickerSheetHeightAnim,
      Math.max(stableBottomInsetRef.current, 0),
    ),
    0,
    resolveStickerSheetMaxHeight(),
  );
  const controlledDockBottomOffset = stickerSheetVisible &&
    stickerSheetOpenedFromKeyboard
    ? stickerSheetHeightAnim
    : stickerSheetLiftOffset;
  const activeDockTranslateY = controlledDockLiftVisible
    ? Animated.multiply(composerContentLiftAnim, -1)
    : zeroDockTranslateAnim;
  const messagesViewportTranslateY = controlledDockLiftVisible
    ? Animated.multiply(composerContentLiftAnim, -1)
    : zeroDockTranslateAnim;
  const dockCoveredHeight = controlledDockLiftVisible
    ? composerContentLiftHeight
    : 0;
  const messagesCoveredBottomInset = dockCoveredHeight;
  return {
    keyboardVisible,
    keyboardVisibleRef,
    composerDockVisible,
    controlledDockLiftVisible,
    stickerSheetVisible,
    stickerSheetOpenedFromKeyboard,
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
    moveComposerAndContentUp,
    moveComposerAndContentDown,
    hideComposerDock,
    showStickerSheet,
    hideStickerSheet,
    switchStickerToKeyboard,
    toggleStickerSheet,
    setStickerSheetHeightImmediate,
    snapStickerSheetHeight,
    activeDockTranslateY,
    messagesViewportTranslateY,
    messagesCoveredBottomInset,
    shouldKeepMessagesAnchoredToBottom: true,
    lockComposerShellHeight: dockVisible,
    dockBottomSpacerHeight: controlledDockLiftVisible
      ? liftedDockGap
      : Math.max(stableBottomInsetRef.current, 0),
    composerShellBottomPadding: 0,
  };
}
