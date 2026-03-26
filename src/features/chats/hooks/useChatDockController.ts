import {
  Animated,
  Keyboard,
  Platform,
  type TextInput as NativeTextInput,
} from "react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { useKeyboardAnimation } from "react-native-keyboard-controller";

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
  const { height: keyboardHeightAnim, progress: keyboardProgressAnim } =
    useKeyboardAnimation();
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
  const stickerKeyboardHandoffTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
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
  const keyboardHeightValueRef = useRef(0);
  const keyboardProgressValueRef = useRef(0);
  const keyboardDockOffsetRef = useRef(0);
  const keyboardVisibleRef = useRef(false);

  const animateAccessoryHeight = useCallback(
    (toValue: number, duration = 220, onComplete?: () => void) => {
      accessoryHeightAnim.stopAnimation();
      accessoryHeightValueRef.current = toValue;
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
    [accessoryHeightAnim],
  );

  const setAccessoryHeightPosition = useCallback(
    (toValue: number) => {
      accessoryHeightAnim.stopAnimation();
      accessoryHeightValueRef.current = toValue;
      accessoryHeightAnim.setValue(toValue);
    },
    [accessoryHeightAnim],
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

  const syncKeyboardVisibility = useCallback((nextInset: number) => {
    const clampedInset = Math.max(0, nextInset);
    const nextVisible = clampedInset > 0;
    keyboardVisibleRef.current = nextVisible;
    setKeyboardVisible((previous) =>
      previous === nextVisible ? previous : nextVisible,
    );
    if (clampedInset > 0) {
      lastKeyboardInsetRef.current = clampedInset;
    }
  }, []);

  const composerClosedBottomInset = Math.max(bottomInset, 12);
  // When keyboard or sticker is active we do not want to preserve closed-state
  // safe-area spacing. The closed safe-area is handled by the bottom spacer only.
  const composerOpenedOffset = 0;

  useEffect(() => {
    const updateKeyboardDockOffset = () => {
      const nextAnimatedVisible =
        keyboardHeightValueRef.current > 1 ||
        keyboardProgressValueRef.current > 0.01;
      keyboardVisibleRef.current = nextAnimatedVisible;
      setKeyboardVisible((previous) =>
        previous === nextAnimatedVisible ? previous : nextAnimatedVisible,
      );
      keyboardDockOffsetRef.current =
        keyboardHeightValueRef.current +
        keyboardProgressValueRef.current * -composerOpenedOffset;

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
      keyboardHeightValueRef.current = value;
      updateKeyboardDockOffset();
    });
    const progressListenerId = keyboardProgressAnim.addListener(({ value }) => {
      keyboardProgressValueRef.current = value;
      updateKeyboardDockOffset();
    });

    updateKeyboardDockOffset();

    return () => {
      keyboardHeightAnim.removeListener(heightListenerId);
      keyboardProgressAnim.removeListener(progressListenerId);
    };
  }, [
    composerOpenedOffset,
    keyboardHeightAnim,
    keyboardProgressAnim,
    setDockPosition,
    stickerOpeningFromKeyboard,
    stickerPickerVisible,
    stickerToKeyboardTransition,
  ]);

  const getStickerPickerHeight = useCallback(() => {
    const rememberedKeyboardHeight = Math.max(
      0,
      lastKeyboardInsetRef.current || 0,
    );
    if (rememberedKeyboardHeight > 0) {
      return rememberedKeyboardHeight;
    }

    const estimatedKeyboardHeight = Math.round(
      screenHeight * (Platform.OS === "ios" ? 0.42 : 0.38),
    );
    return Math.max(DEFAULT_STICKER_PICKER_HEIGHT, estimatedKeyboardHeight);
  }, [screenHeight]);

  const getStickerDockHeight = useCallback(() => {
    const rememberedKeyboardHeight = Math.max(
      0,
      lastKeyboardInsetRef.current || 0,
    );
    if (rememberedKeyboardHeight > 0) {
      return Math.max(DEFAULT_STICKER_PICKER_HEIGHT, rememberedKeyboardHeight);
    }

    const rememberedDockHeight = Math.max(
      0,
      Math.abs(keyboardDockOffsetRef.current || 0),
    );
    if (rememberedDockHeight > 0) {
      return Math.max(DEFAULT_STICKER_PICKER_HEIGHT, rememberedDockHeight);
    }

    return Math.max(0, getStickerPickerHeight());
  }, [getStickerPickerHeight]);

  const getKeyboardDockOffset = useCallback(() => {
    return keyboardDockOffsetRef.current || 0;
  }, []);

  const hideStickerPicker = useCallback(
    (focusInput = false) => {
      if (closingStickerPickerRef.current && !focusInput) {
        return;
      }
      pendingStickerOpenRef.current = false;
      setStickerOpeningFromKeyboard(false);
      setComposerSoftInputEnabled(true);

      if (isWeb) {
        closingStickerPickerRef.current = false;
        setStickerPickerVisible(false);
        setStickerOpeningFromKeyboard(false);
        setStickerToKeyboardTransition(false);
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

      if (Platform.OS === "android" && focusInput) {
        closingStickerPickerRef.current = false;
        stickerTransitionDockRef.current =
          accessoryDockValueRef.current || -getStickerDockHeight();
        setStickerOpeningFromKeyboard(false);
        setStickerToKeyboardTransition(true);
        requestAnimationFrame(() => {
          composerInputRef.current?.focus();
        });
        return;
      }

      if (focusInput) {
        closingStickerPickerRef.current = false;
        stickerTransitionDockRef.current =
          accessoryDockValueRef.current || -getStickerDockHeight();
        setStickerOpeningFromKeyboard(false);
        setStickerToKeyboardTransition(true);
        requestAnimationFrame(() => {
          composerInputRef.current?.focus();
        });
        return;
      }

      setStickerToKeyboardTransition(false);
      if (!keyboardVisibleRef.current) {
        closingStickerPickerRef.current = true;
        animateAccessoryHeight(0, 240, () => {
          closingStickerPickerRef.current = false;
          setStickerPickerVisible(false);
          setStickerOpeningFromKeyboard(false);
        });
        animateAccessoryDockPosition(0, 240);
        animateDockPosition(0, 240);
        return;
      }
      closingStickerPickerRef.current = false;
      setStickerPickerVisible(false);
      setStickerOpeningFromKeyboard(false);
    },
    [
      animateDockPosition,
      animateAccessoryDockPosition,
      animateAccessoryHeight,
      composerInputRef,
      getStickerDockHeight,
      isWeb,
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
    const transitioningFromKeyboard = keyboardVisibleRef.current;
    closingStickerPickerRef.current = false;
    setStickerToKeyboardTransition(false);
    setComposerSoftInputEnabled(false);
    openingStickerPickerRef.current = true;
    composerFocusedRef.current = false;
    accessoryHeightAnim.stopAnimation();
    stickerTransitionDockRef.current = nextDock;
    if (transitioningFromKeyboard) {
      const currentDockOffset = dockTranslateValueRef.current || getKeyboardDockOffset();
      const transitionDock = currentDockOffset || nextDock;
      const transitionHeight = Math.max(
        DEFAULT_STICKER_PICKER_HEIGHT,
        Math.abs(transitionDock) || nextHeight,
      );
      stickerTransitionDockRef.current = transitionDock;
      pendingStickerOpenRef.current = true;
      setAccessoryHeightPosition(transitionHeight);
      setAccessoryDockPosition(transitionDock);
      setFrozenDockPosition(transitionDock);
      setDockPosition(transitionDock);
      setStickerOpeningFromKeyboard(true);
      setStickerPickerVisible(true);
      if (stickerKeyboardHandoffTimeoutRef.current) {
        clearTimeout(stickerKeyboardHandoffTimeoutRef.current);
      }
      stickerKeyboardHandoffTimeoutRef.current = setTimeout(() => {
        stickerKeyboardHandoffTimeoutRef.current = null;
        composerInputRef.current?.blur();
        Keyboard.dismiss();
      }, 48);
      return;
    }

    pendingStickerOpenRef.current = false;
    setStickerOpeningFromKeyboard(false);
    setStickerPickerVisible(true);
    setDockPosition(0);
    setAccessoryDockPosition(0);
    setAccessoryHeightPosition(0);
    animateAccessoryHeight(nextHeight);
    animateAccessoryDockPosition(nextDock);
    animateDockPosition(nextDock);
    composerInputRef.current?.blur();
    Keyboard.dismiss();
  }, [
    accessoryHeightAnim,
    animateDockPosition,
    animateAccessoryDockPosition,
    animateAccessoryHeight,
    composerFocusedRef,
    composerInputRef,
    getKeyboardDockOffset,
    getStickerDockHeight,
    setAccessoryHeightPosition,
    setAccessoryDockPosition,
    setDockPosition,
    setFrozenDockPosition,
  ]);

  const toggleStickerPicker = useCallback(() => {
    if (stickerPickerVisible) {
      hideStickerPicker(true);
      return;
    }

    openStickerPicker();
  }, [hideStickerPicker, openStickerPicker, stickerPickerVisible]);

  const keyboardOpenedOffsetAnim = useMemo(
    () =>
      keyboardProgressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -composerOpenedOffset],
        extrapolate: "clamp",
      }),
    [composerOpenedOffset, keyboardProgressAnim],
  );

  const keyboardDockTranslateY = useMemo(
    () => Animated.add(keyboardHeightAnim, keyboardOpenedOffsetAnim),
    [keyboardHeightAnim, keyboardOpenedOffsetAnim],
  );
  const stickerDockTranslateY = useMemo(
    () => Animated.multiply(accessoryHeightAnim, -1),
    [accessoryHeightAnim],
  );

  const isStickerDockSettled =
    stickerPickerVisible &&
    !keyboardVisible &&
    !stickerOpeningFromKeyboard &&
    !stickerToKeyboardTransition;
  const stickerDockActive =
    stickerPickerVisible ||
    stickerOpeningFromKeyboard ||
    stickerToKeyboardTransition;
  const activeDockTranslateY = stickerDockActive
    ? stickerDockTranslateY
    : keyboardDockTranslateY;
  const messagesViewportTranslateY = stickerDockActive
    ? stickerDockTranslateY
    : keyboardDockTranslateY;
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
            setStickerOpeningFromKeyboard(false);
            setDockPosition(keyboardDockOffsetRef.current || -nextInset);
            setAccessoryDockPosition(-nextInset);
            closingStickerPickerRef.current = false;
            setStickerPickerVisible(false);
            setStickerToKeyboardTransition(false);
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
          if (pendingStickerOpenRef.current) {
            return;
          }
          if (stickerToKeyboardTransition) {
            return;
          }
          if (!stickerPickerVisible && !stickerToKeyboardTransition) {
            syncKeyboardVisibility(0);
            setStickerToKeyboardTransition(false);
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
            setStickerPickerVisible(true);
            animateDockPosition(stickerTransitionDockRef.current, 140, () => {
              setFrozenDockPosition(stickerTransitionDockRef.current);
              setAccessoryDockPosition(stickerTransitionDockRef.current);
              setStickerOpeningFromKeyboard(false);
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
          setStickerOpeningFromKeyboard(false);
          setDockPosition(keyboardDockOffsetRef.current || -nextInset);
          setAccessoryDockPosition(-nextInset);
          closingStickerPickerRef.current = false;
          setStickerPickerVisible(false);
          setStickerToKeyboardTransition(false);
        }
        animateAccessoryHeight(0, 0);
        if (composerFocusedRef.current) {
          requestAnimationFrame(() => {
            scrollToLatestMessage(false);
          });
        }
      },
    );
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      syncKeyboardVisibility(0);
      if (pendingStickerOpenRef.current) {
        pendingStickerOpenRef.current = false;
        closingStickerPickerRef.current = false;
        setStickerPickerVisible(true);
        animateDockPosition(stickerTransitionDockRef.current, 140, () => {
          setFrozenDockPosition(stickerTransitionDockRef.current);
          setAccessoryDockPosition(stickerTransitionDockRef.current);
          setStickerOpeningFromKeyboard(false);
        });
        setAccessoryHeightPosition(getStickerDockHeight());
        return;
      }
      if (!stickerPickerVisible && !stickerToKeyboardTransition) {
        setStickerToKeyboardTransition(false);
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
    animateDockPosition,
    animateAccessoryDockPosition,
    animateAccessoryHeight,
    composerFocusedRef,
    composerOpenedOffset,
    getStickerDockHeight,
    isWeb,
    scrollToLatestMessage,
    screenHeight,
    setDockPosition,
    setAccessoryHeightPosition,
    setAccessoryDockPosition,
    setFrozenDockPosition,
    stickerPickerVisible,
    stickerToKeyboardTransition,
    syncKeyboardVisibility,
  ]);

  useEffect(() => {
    return () => {
      if (stickerKeyboardHandoffTimeoutRef.current) {
        clearTimeout(stickerKeyboardHandoffTimeoutRef.current);
        stickerKeyboardHandoffTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    accessoryHeightAnim,
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
    activeDockTranslateY,
    messagesViewportTranslateY,
    isStickerDockSettled,
    shouldKeepMessagesAnchoredToBottom,
    lockComposerShellHeight,
    dockBottomSpacerHeight,
    composerShellBottomPadding,
  };
}
