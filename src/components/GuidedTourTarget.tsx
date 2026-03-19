import { useCallback, useEffect, useRef } from "react";
import type { LayoutChangeEvent, ViewProps } from "react-native";
import { InteractionManager, View } from "react-native";
import useGuidedTourStore from "../store/guided-tour-store";

type GuidedTourTargetProps = ViewProps & {
  targetKey: string;
};

export function GuidedTourTarget({
  children,
  targetKey,
  onLayout,
  ...rest
}: GuidedTourTargetProps) {
  const ref = useRef<View>(null);
  const active = useGuidedTourStore((state) => state.active);
  const stepKey = useGuidedTourStore((state) => state.stepKey);
  const registerTarget = useGuidedTourStore((state) => state.registerTarget);
  const clearTarget = useGuidedTourStore((state) => state.clearTarget);

  const measureTarget = useCallback(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    requestAnimationFrame(() => {
      node.measureInWindow((x, y, width, height) => {
        if (!width || !height) {
          return;
        }

        registerTarget(targetKey, { x, y, width, height });
      });
    });
  }, [registerTarget, targetKey]);

  useEffect(() => {
    measureTarget();

    return () => {
      clearTarget(targetKey);
    };
  }, [clearTarget, measureTarget, targetKey]);

  useEffect(() => {
    if (!(active && stepKey === targetKey)) {
      return;
    }

    const interaction = InteractionManager.runAfterInteractions(() => {
      measureTarget();
    });

    return () => {
      interaction.cancel();
    };
  }, [active, measureTarget, stepKey, targetKey]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      measureTarget();
    },
    [measureTarget, onLayout],
  );

  return (
    <View ref={ref} collapsable={false} onLayout={handleLayout} {...rest}>
      {children}
    </View>
  );
}
