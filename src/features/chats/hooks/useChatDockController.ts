import {
  Animated,
  Keyboard,
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
import { Easing, useSharedValue, withTiming } from "react-native-reanimated";
import { useKeyboardHeight } from "./useKeyboardHeight";

const DEFAULT_STICKER_PICKER_HEIGHT = 320;

export function useChatDockController({
  screenHeight,
  bottomInset,
  isWeb,
  composerInputRef,
  composerFocusedRef,
  scrollToLatestMessage,
}: {
  screenHeight: number;
  bottomInset: number;
  isWeb: boolean;
  composerInputRef: RefObject<NativeTextInput | null>;
  composerFocusedRef: MutableRefObject<boolean>;
  scrollToLatestMessage: (animated?: boolean) => void;
}) {
  const {
    keyboardHeightAnim,
    keyboardProgressAnim,
    keyboardTranslateYRef,
    keyboardHeightRef,
    keyboardProgressRef,
    lastOpenedKeyboardHeightRef,
  } = useKeyboardHeight();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
  const [stickerOpeningFromKeyboard, setStickerOpeningFromKeyboard] =
    useState(false);
  const [stickerToKeyboardTransition, setStickerToKeyboardTransition] =
    useState(false);
  const [composerSoftInputEnabled, setComposerSoftInputEnabled] =
    useState(true);

  const openingStickerPickerRef = useRef(false);
  const closingStickerPickerRef = useRef(false);
  const pendingStickerOpenRef = useRef(false);
  const accessoryHeightAnim = useRef(new Animated.Value(0)).current;
  const accessoryDockTranslateAnim = useRef(new Animated.Value(0)).current;
  const frozenDockTranslateAnim = useRef(new Animated.Value(0)).current;
  const dockTranslateAnim = useRef(new Animated.Value(0)).current;
  const accessoryDockValueRef = useRef(0);
  const accessoryHeightValueRef = useRef(0);
  const frozenDockValueRef = useRef(0);
  const dockTranslateValueRef = useRef(0);
  const stickerTransitionDockRef = useRef(0);
  const lastKeyboardInsetRef = useRef(0);
  const keyboardDockOffsetRef = useRef(0);
  const keyboardVisibleRef = useRef(false);
  const pickerHeightSharedValue = useSharedValue(0);

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

        animateNextLayout();
        return nextVisible;
      });
    },
    [animateNextLayout],
  );

  const setStickerPickerVisibleAnimated = useCallback(
    (nextVisible: boolean) => {
      setStickerPickerVisible((previous) => {
        if (previous === nextVisible) {
          return previous;
        }

        animateNextLayout();
        return nextVisible;
      });
    },
    [animateNextLayout],
  );

  const setStickerOpeningFromKeyboardAnimated = useCallback(
    (nextVisible: boolean) => {
      setStickerOpeningFromKeyboard((previous) => {
        if (previous === nextVisible) {
          return previous;
        }

        animateNextLayout();
        return nextVisible;
      });
    },
    [animateNextLayout],
  );

  const setStickerToKeyboardTransitionAnimated = useCallback(
    (nextVisible: boolean) => {
      setStickerToKeyboardTransition((previous) => {
        if (previous === nextVisible) {
          return previous;
        }

        animateNextLayout();
        return nextVisible;
      });
    },
    [animateNextLayout],
  );

  const animateAccessoryHeight = useCallback(
    (toValue: number, duration = 220, onComplete?: () => void) => {
      accessoryHeightAnim.stopAnimation();
      accessoryHeightValueRef.current = toValue;
      pickerHeightSharedValue.value = withTiming(toValue, {
        duration: Math.max(0, duration || 300),
        easing: Easing.out(Easing.ease),
      });
      Animated.timing(accessoryHeightAnim, {
        toValue,
        duration,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          onComplete?.();
        }
      });
    },
    [accessoryHeightAnim, pickerHeightSharedValue],
  );

  const setAccessoryHeightPosition = useCallback(
    (toValue: number) => {
      accessoryHeightAnim.stopAnimation();
      accessoryHeightValueRef.current = toValue;
      pickerHeightSharedValue.value = toValue;
      accessoryHeightAnim.setValue(toValue);
    },
    [accessoryHeightAnim, pickerHeightSharedValue],
  );

  const animateAccessoryDockPosition = useCallback(
    (toValue: number, duration = 220, onComplete?: () => void) => {
      accessoryDockTranslateAnim.stopAnimation();
      accessoryDockValueRef.current = toValue;
      Animated.timing(accessoryDockTranslateAnim, {
        toValue,
        duration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          accessoryDockValueRef.current = toValue;
          onComplete?.();
        }
      });
    },
    [accessoryDockTranslateAnim],
  );

  const setAccessoryDockPosition = useCallback(
    (toValue: number) => {
      accessoryDockTranslateAnim.stopAnimation();
      accessoryDockValueRef.current = toValue;
      accessoryDockTranslateAnim.setValue(toValue);
    },
    [accessoryDockTranslateAnim],
  );

  const setFrozenDockPosition = useCallback(
    (toValue: number) => {
      frozenDockValueRef.current = toValue;
      frozenDockTranslateAnim.setValue(toValue);
    },
    [frozenDockTranslateAnim],
  );

  const animateDockPosition = useCallback(
    (toValue: number, duration = 220, onComplete?: () => void) => {
      dockTranslateAnim.stopAnimation();
      dockTranslateValueRef.current = toValue;
      Animated.timing(dockTranslateAnim, {
        toValue,
        duration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          dockTranslateValueRef.current = toValue;
          onComplete?.();
        }
      });
    },
    [dockTranslateAnim],
  );

  const setDockPosition = useCallback(
    (toValue: number) => {
      dockTranslateAnim.stopAnimation();
      dockTranslateValueRef.current = toValue;
      dockTranslateAnim.setValue(toValue);
    },
    [dockTranslateAnim],
  );

  const syncKeyboardVisibility = useCallback(
    (nextInset: number) => {
      const clampedInset = Math.max(0, nextInset);
      const nextVisible = clampedInset > 0;
      keyboardVisibleRef.current = nextVisible;
      setKeyboardVisibleAnimated(nextVisible);
      if (clampedInset > 0) {
        lastKeyboardInsetRef.current = clampedInset;
        lastOpenedKeyboardHeightRef.current = clampedInset;
      }
    },
    [lastOpenedKeyboardHeightRef, setKeyboardVisibleAnimated],
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
    const updateKeyboardDockOffset = () => {
      const nextAnimatedVisible =
        keyboardHeightRef.current > 1 || keyboardProgressRef.current > 0.01;
      keyboardVisibleRef.current = nextAnimatedVisible;
      setKeyboardVisibleAnimated(nextAnimatedVisible);
      keyboardDockOffsetRef.current = keyboardTranslateYRef.current || 0;

      if (
        !pendingStickerOpenRef.current &&
        !stickerPickerVisible &&
        !stickerOpeningFromKeyboard &&
        !stickerToKeyboardTransition
      ) {
        setDockPosition(keyboardDockOffsetRef.current);
      }
    };

    const heightListenerId = keyboardHeightAnim.addListener(({ value }) => {
      const nextTranslateY = value || 0;
      const nextHeight = Math.max(0, Math.abs(nextTranslateY));
      keyboardTranslateYRef.current = nextTranslateY;
      keyboardHeightRef.current = nextHeight;
      if (nextHeight > 0) {
        lastOpenedKeyboardHeightRef.current = nextHeight;
      }
      updateKeyboardDockOffset();
    });
    const progressListenerId = keyboardProgressAnim.addListener(({ value }) => {
      keyboardProgressRef.current = Math.max(0, value || 0);
      updateKeyboardDockOffset();
    });

    updateKeyboardDockOffset();

    return () => {
      keyboardHeightAnim.removeListener(heightListenerId);
      keyboardProgressAnim.removeListener(progressListenerId);
    };
  }, [
    keyboardHeightAnim,
    keyboardProgressAnim,
    keyboardHeightRef,
    keyboardProgressRef,
    keyboardTranslateYRef,
    lastOpenedKeyboardHeightRef,
    setDockPosition,
    setKeyboardVisibleAnimated,
    stickerOpeningFromKeyboard,
    stickerPickerVisible,
    stickerToKeyboardTransition,
  ]);

  const getStickerPickerHeight = useCallback(() => {
    const rememberedKeyboardHeight = Math.max(
      0,
      lastOpenedKeyboardHeightRef.current || lastKeyboardInsetRef.current || 0,
    );
    if (rememberedKeyboardHeight > 0) {
      return rememberedKeyboardHeight;
    }

    const estimatedKeyboardHeight = Math.round(
      screenHeight * (Platform.OS === "ios" ? 0.42 : 0.38),
    );
    return Math.max(DEFAULT_STICKER_PICKER_HEIGHT, estimatedKeyboardHeight);
  }, [lastOpenedKeyboardHeightRef, screenHeight]);

  const getStickerDockHeight = useCallback(() => {
    const rememberedKeyboardHeight = Math.max(
      0,
      lastOpenedKeyboardHeightRef.current || lastKeyboardInsetRef.current || 0,
    );
    if (rememberedKeyboardHeight > 0) {
      return rememberedKeyboardHeight;
    }

    const rememberedDockHeight = Math.max(
      0,
      Math.abs(keyboardDockOffsetRef.current || 0),
    );
    if (rememberedDockHeight > 0) {
      return rememberedDockHeight;
    }

    return Math.max(0, getStickerPickerHeight());
  }, [getStickerPickerHeight, lastOpenedKeyboardHeightRef]);

  const getKeyboardDockOffset = useCallback(() => {
    return keyboardDockOffsetRef.current || 0;
  }, []);

  const hideStickerPicker = useCallback(
    (focusInput = false) => {
      if (closingStickerPickerRef.current && !focusInput) {
        return;
      }

      pendingStickerOpenRef.current = false;
      setStickerOpeningFromKeyboardAnimated(false);
      setComposerSoftInputEnabled(true);

      if (isWeb) {
        closingStickerPickerRef.current = false;
        setStickerPickerVisibleAnimated(false);
        setStickerOpeningFromKeyboardAnimated(false);
        setStickerToKeyboardTransitionAnimated(false);
        animateAccessoryHeight(0, 120);
        animateAccessoryDockPosition(0, 120);
        animateDockPosition(0, 120);
        if (focusInput) {
          requestAnimationFrame(() => {
            composerInputRef.current?.focus();
          });
        }
        return;
      }

      if (focusInput) {
        closingStickerPickerRef.current = false;
        stickerTransitionDockRef.current =
          accessoryDockValueRef.current || -getStickerDockHeight();
        setStickerOpeningFromKeyboardAnimated(false);
        setStickerToKeyboardTransitionAnimated(true);
        requestAnimationFrame(() => {
          composerInputRef.current?.focus();
        });
        return;
      }

      setStickerToKeyboardTransitionAnimated(false);
      if (!keyboardVisibleRef.current) {
        closingStickerPickerRef.current = true;
        animateAccessoryHeight(0, 240, () => {
          closingStickerPickerRef.current = false;
          setStickerPickerVisibleAnimated(false);
          setStickerOpeningFromKeyboardAnimated(false);
        });
        animateAccessoryDockPosition(0, 240);
        animateDockPosition(0, 240);
        return;
      }

      closingStickerPickerRef.current = false;
      setStickerPickerVisibleAnimated(false);
      setStickerOpeningFromKeyboardAnimated(false);
    },
    [
      animateAccessoryDockPosition,
      animateAccessoryHeight,
      animateDockPosition,
      composerInputRef,
      getStickerDockHeight,
      isWeb,
      setStickerOpeningFromKeyboardAnimated,
      setStickerPickerVisibleAnimated,
      setStickerToKeyboardTransitionAnimated,
    ],
  );

  const dismissKeyboard = useCallback(
    (options?: { preserveStickerPicker?: boolean }) => {
      composerFocusedRef.current = false;
      composerInputRef.current?.blur();
      Keyboard.dismiss();
      if (!options?.preserveStickerPicker && stickerPickerVisible) {
        hideStickerPicker(false);
      }
    },
    [composerFocusedRef, composerInputRef, hideStickerPicker, stickerPickerVisible],
  );

  const openStickerPicker = useCallback(() => {
    const nextHeight = getStickerDockHeight();
    const nextDock = -nextHeight;
    const closedBottomInset = Math.max(bottomInset, 0);
    const currentDockOffset =
      dockTranslateValueRef.current || getKeyboardDockOffset();
    const transitioningFromKeyboard =
      keyboardVisibleRef.current || currentDockOffset < -1;

    closingStickerPickerRef.current = false;
    setStickerToKeyboardTransitionAnimated(false);
    setComposerSoftInputEnabled(false);
    openingStickerPickerRef.current = true;
    composerFocusedRef.current = false;
    accessoryHeightAnim.stopAnimation();
    stickerTransitionDockRef.current = nextDock;

    if (transitioningFromKeyboard) {
      const transitionDock = currentDockOffset || nextDock;
      const transitionHeight = Math.max(
        Math.abs(transitionDock) || 0,
        nextHeight,
      );

      pendingStickerOpenRef.current = true;
      stickerTransitionDockRef.current = transitionDock;
      setAccessoryHeightPosition(transitionHeight);
      setAccessoryDockPosition(transitionDock);
      setFrozenDockPosition(transitionDock);
      setDockPosition(transitionDock);
      setStickerOpeningFromKeyboardAnimated(true);
      setStickerPickerVisibleAnimated(true);
      requestAnimationFrame(() => {
        composerInputRef.current?.blur();
        Keyboard.dismiss();
      });
      return;
    }

    pendingStickerOpenRef.current = false;
    setStickerOpeningFromKeyboardAnimated(false);
    setDockPosition(-closedBottomInset);
    setAccessoryDockPosition(-closedBottomInset);
    setStickerPickerVisibleAnimated(true);
    setAccessoryHeightPosition(0);
    animateAccessoryHeight(nextHeight);
    animateAccessoryDockPosition(nextDock);
    animateDockPosition(nextDock);
    composerInputRef.current?.blur();
    Keyboard.dismiss();
  }, [
    accessoryHeightAnim,
    animateAccessoryDockPosition,
    animateAccessoryHeight,
    animateDockPosition,
    bottomInset,
    composerFocusedRef,
    composerInputRef,
    getKeyboardDockOffset,
    getStickerDockHeight,
    setAccessoryDockPosition,
    setAccessoryHeightPosition,
    setDockPosition,
    setFrozenDockPosition,
    setStickerOpeningFromKeyboardAnimated,
    setStickerPickerVisibleAnimated,
    setStickerToKeyboardTransitionAnimated,
  ]);

  const toggleStickerPicker = useCallback(() => {
    if (stickerPickerVisible) {
      hideStickerPicker(true);
      return;
    }

    openStickerPicker();
  }, [hideStickerPicker, openStickerPicker, stickerPickerVisible]);

  const isStickerDockSettled =
    stickerPickerVisible &&
    !keyboardVisible &&
    !stickerOpeningFromKeyboard &&
    !stickerToKeyboardTransition;
  const stickerDockActive =
    stickerPickerVisible ||
    stickerOpeningFromKeyboard ||
    stickerToKeyboardTransition;
  const shouldKeepMessagesAnchoredToBottom = !stickerToKeyboardTransition;
  const lockComposerShellHeight =
    stickerOpeningFromKeyboard || stickerToKeyboardTransition;
  const dockBottomSpacerHeight = stickerOpeningFromKeyboard
    ? 0
    : stickerPickerVisible && !keyboardVisible && !stickerToKeyboardTransition
      ? 0
      : !keyboardVisible && !stickerToKeyboardTransition
        ? Math.max(bottomInset, 0)
        : 0;
  const composerShellBottomPadding =
    keyboardVisible ||
    stickerPickerVisible ||
    stickerToKeyboardTransition ||
    stickerOpeningFromKeyboard
      ? 6
      : 0;

  useEffect(() => {
    if (isWeb) {
      return;
    }

    if (Platform.OS === "ios") {
      const applyIosKeyboardLayout = (event: {
        endCoordinates: { screenY?: number; height?: number };
        duration?: number;
      }) => {
        const overlapFromScreenY =
          typeof event.endCoordinates?.screenY === "number"
            ? Math.max(0, screenHeight - event.endCoordinates.screenY)
            : 0;
        const overlapFromHeight = Math.max(
          0,
          event.endCoordinates?.height || 0,
        );
        const nextInset = Math.max(overlapFromScreenY, overlapFromHeight);
        const duration =
          typeof event.duration === "number" ? event.duration : 220;
        const stickerHeight =
          stickerPickerVisible || stickerToKeyboardTransition
            ? getStickerDockHeight()
            : 0;

        syncKeyboardVisibility(nextInset);
        if (pendingStickerOpenRef.current) {
          return;
        }
        if (stickerToKeyboardTransition) {
          const nextDock = Math.min(
            stickerTransitionDockRef.current,
            -Math.max(0, nextInset),
          );
          setDockPosition(nextDock);
          setAccessoryDockPosition(nextDock);
          return;
        }
        if (!stickerPickerVisible) {
          setDockPosition(keyboardDockOffsetRef.current);
        }
        if (stickerPickerVisible && nextInset <= 0) {
          animateAccessoryHeight(stickerHeight, duration);
        } else {
          animateAccessoryHeight(0, Math.min(duration, 70));
        }
      };

      const willShowSubscription = Keyboard.addListener(
        "keyboardWillShow",
        (event) => {
          applyIosKeyboardLayout(event);
        },
      );
      const frameChangeSubscription = Keyboard.addListener(
        "keyboardWillChangeFrame",
        (event) => {
          applyIosKeyboardLayout(event);
        },
      );
      const showSubscription = Keyboard.addListener(
        "keyboardDidShow",
        (event) => {
          const nextInset = Math.max(0, event.endCoordinates?.height || 0);
          syncKeyboardVisibility(nextInset);
          if (stickerToKeyboardTransition) {
            setStickerOpeningFromKeyboardAnimated(false);
            setDockPosition(keyboardDockOffsetRef.current || -nextInset);
            setAccessoryDockPosition(-nextInset);
            closingStickerPickerRef.current = false;
            setStickerPickerVisibleAnimated(false);
            setStickerToKeyboardTransitionAnimated(false);
          }
          animateAccessoryHeight(0, 64);
        },
      );
      const hideSubscription = Keyboard.addListener(
        "keyboardWillHide",
        (event) => {
          const duration =
            typeof event.duration === "number" ? event.duration : 220;
          const stickerHeight =
            stickerPickerVisible || stickerToKeyboardTransition
              ? getStickerDockHeight()
              : 0;
          if (pendingStickerOpenRef.current || stickerToKeyboardTransition) {
            return;
          }
          if (!stickerPickerVisible && !stickerToKeyboardTransition) {
            syncKeyboardVisibility(0);
            setStickerToKeyboardTransitionAnimated(false);
          }
          animateAccessoryHeight(
            stickerPickerVisible || stickerToKeyboardTransition
              ? stickerHeight
              : 0,
            stickerPickerVisible || stickerToKeyboardTransition ? duration : 70,
          );
        },
      );
      const didHideSubscription = Keyboard.addListener(
        "keyboardDidHide",
        () => {
          syncKeyboardVisibility(0);
          if (pendingStickerOpenRef.current) {
            pendingStickerOpenRef.current = false;
            closingStickerPickerRef.current = false;
            setStickerPickerVisibleAnimated(true);
            animateDockPosition(stickerTransitionDockRef.current, 140, () => {
              setFrozenDockPosition(stickerTransitionDockRef.current);
              setAccessoryDockPosition(stickerTransitionDockRef.current);
              setStickerOpeningFromKeyboardAnimated(false);
            });
            setAccessoryHeightPosition(getStickerDockHeight());
          }
        },
      );

      return () => {
        willShowSubscription.remove();
        frameChangeSubscription.remove();
        showSubscription.remove();
        hideSubscription.remove();
        didHideSubscription.remove();
      };
    }

    const showSubscription = Keyboard.addListener(
      "keyboardDidShow",
      (event) => {
        const nextInset = Math.max(0, event.endCoordinates?.height || 0);
        syncKeyboardVisibility(nextInset);
        if (stickerToKeyboardTransition) {
          setStickerOpeningFromKeyboardAnimated(false);
          setDockPosition(keyboardDockOffsetRef.current || -nextInset);
          setAccessoryDockPosition(-nextInset);
          closingStickerPickerRef.current = false;
          setStickerPickerVisibleAnimated(false);
          setStickerToKeyboardTransitionAnimated(false);
        }
        animateAccessoryHeight(0, 0);
      },
    );
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      syncKeyboardVisibility(0);
      if (pendingStickerOpenRef.current) {
        pendingStickerOpenRef.current = false;
        closingStickerPickerRef.current = false;
        setStickerPickerVisibleAnimated(true);
        animateDockPosition(stickerTransitionDockRef.current, 140, () => {
          setFrozenDockPosition(stickerTransitionDockRef.current);
          setAccessoryDockPosition(stickerTransitionDockRef.current);
          setStickerOpeningFromKeyboardAnimated(false);
        });
        setAccessoryHeightPosition(getStickerDockHeight());
        return;
      }
      if (!stickerPickerVisible && !stickerToKeyboardTransition) {
        setStickerToKeyboardTransitionAnimated(false);
      }
      animateAccessoryHeight(
        stickerPickerVisible || stickerToKeyboardTransition
          ? getStickerDockHeight()
          : 0,
        180,
      );
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [
    animateAccessoryDockPosition,
    animateAccessoryHeight,
    animateDockPosition,
    getStickerDockHeight,
    isWeb,
    screenHeight,
    setAccessoryDockPosition,
    setAccessoryHeightPosition,
    setDockPosition,
    setFrozenDockPosition,
    setStickerOpeningFromKeyboardAnimated,
    setStickerPickerVisibleAnimated,
    setStickerToKeyboardTransitionAnimated,
    stickerPickerVisible,
    stickerToKeyboardTransition,
    syncKeyboardVisibility,
  ]);

  return {
    pickerHeightSharedValue,
    keyboardVisible,
    keyboardVisibleRef,
    stickerPickerVisible,
    stickerOpeningFromKeyboard,
    stickerToKeyboardTransition,
    composerSoftInputEnabled,
    openingStickerPickerRef,
    animateAccessoryHeight,
    hideStickerPicker,
    toggleStickerPicker,
    dismissKeyboard,
    setComposerSoftInputEnabled,
    activeDockTranslateY: stickerDockActive
      ? dockTranslateAnim
      : keyboardHeightAnim,
    messagesViewportTranslateY: stickerDockActive
      ? dockTranslateAnim
      : keyboardHeightAnim,
    isStickerDockSettled,
    shouldKeepMessagesAnchoredToBottom,
    lockComposerShellHeight,
    dockBottomSpacerHeight,
    composerShellBottomPadding,
  };
}
