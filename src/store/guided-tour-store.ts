import { create } from "zustand";

export type GuidedTourTargetLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GuidedTourState = {
  active: boolean;
  stepIndex: number;
  stepKey: string | null;
  targets: Record<string, GuidedTourTargetLayout>;
  start: (stepKey?: string) => void;
  setStep: (stepIndex: number, stepKey: string) => void;
  registerTarget: (key: string, layout: GuidedTourTargetLayout) => void;
  clearTarget: (key: string) => void;
  close: () => void;
};

const useGuidedTourStore = create<GuidedTourState>((set) => ({
  active: false,
  stepIndex: 0,
  stepKey: null,
  targets: {},
  start: (stepKey = "profile-overview") =>
    set({
      active: true,
      stepIndex: 0,
      stepKey,
    }),
  setStep: (stepIndex, stepKey) =>
    set({
      active: true,
      stepIndex,
      stepKey,
    }),
  registerTarget: (key, layout) =>
    set((state) => ({
      targets: {
        ...state.targets,
        [key]: layout,
      },
    })),
  clearTarget: (key) =>
    set((state) => {
      if (!state.targets[key]) {
        return state;
      }

      const nextTargets = { ...state.targets };
      delete nextTargets[key];
      return { targets: nextTargets };
    }),
  close: () =>
    set({
      active: false,
      stepIndex: 0,
      stepKey: null,
      targets: {},
    }),
}));

export default useGuidedTourStore;
