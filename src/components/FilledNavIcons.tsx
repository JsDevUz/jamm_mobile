import type { ReactNode } from "react";
import Svg, { Path } from "react-native-svg";

type IconProps = {
  size?: number;
  color?: string;
};

function IconBase({
  size = 20,
  color = "currentColor",
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

export function FeedFilledIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size} color={color}>
      <Path
        fill={color}
        d="M11.47 3.84a.75.75 0 0 1 1.06 0l7 6.75a.75.75 0 0 1-.52 1.29h-.76v6.37a1.5 1.5 0 0 1-1.5 1.5h-3.5a.75.75 0 0 1-.75-.75v-4a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v4a.75.75 0 0 1-.75.75h-3.5a1.5 1.5 0 0 1-1.5-1.5v-6.37h-.76a.75.75 0 0 1-.52-1.29l7-6.75Z"
      />
    </IconBase>
  );
}

export function ChatsFilledIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size} color={color}>
      <Path
        fill={color}
        d="M5.25 4.5A3.25 3.25 0 0 0 2 7.75v6.5a3.25 3.25 0 0 0 3.25 3.25h1.83a1 1 0 0 1 .65.24l2.5 2.14c.98.84 2.52.14 2.52-1.15v-.23a1 1 0 0 1 1-1h5A3.25 3.25 0 0 0 22 14.25v-6.5A3.25 3.25 0 0 0 18.75 4.5H5.25Zm2.5 4.25a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1-.75-.75Zm0 3.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H8.5a.75.75 0 0 1-.75-.75Z"
      />
    </IconBase>
  );
}

export function ArticlesFilledIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size} color={color}>
      <Path
        fill={color}
        d="M6.75 3A2.75 2.75 0 0 0 4 5.75v12.5A2.75 2.75 0 0 0 6.75 21h10.5A2.75 2.75 0 0 0 20 18.25V5.75A2.75 2.75 0 0 0 17.25 3H6.75Zm1.5 4.25A.75.75 0 0 1 9 6.5h6a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Zm0 4A.75.75 0 0 1 9 10.5h6a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Zm0 4A.75.75 0 0 1 9 14.5h3.5a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Z"
      />
    </IconBase>
  );
}

export function CoursesFilledIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size} color={color}>
      <Path
        fill={color}
        d="M12 3.25a2.5 2.5 0 0 0-1.77.73L5.48 8.73a2.5 2.5 0 0 0-.73 1.77v7.25A2.25 2.25 0 0 0 7 20h10a2.25 2.25 0 0 0 2.25-2.25V10.5a2.5 2.5 0 0 0-.73-1.77l-4.75-4.75A2.5 2.5 0 0 0 12 3.25Zm-.75 4A.75.75 0 0 1 12 6.5h3.25a.75.75 0 0 1 0 1.5H12a.75.75 0 0 1-.75-.75Zm0 3.5A.75.75 0 0 1 12 10h3.25a.75.75 0 0 1 0 1.5H12a.75.75 0 0 1-.75-.75Zm0 3.5A.75.75 0 0 1 12 13.5h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z"
      />
      <Path
        fill={color}
        d="M8.25 6.75A.75.75 0 0 1 9 6h.01a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Zm0 3.5A.75.75 0 0 1 9 9.5h.01a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Zm0 3.5A.75.75 0 0 1 9 13h.01a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Z"
      />
    </IconBase>
  );
}

export function AdminFilledIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size} color={color}>
      <Path
        fill={color}
        d="M5.75 3A2.75 2.75 0 0 0 3 5.75v4.5A2.75 2.75 0 0 0 5.75 13h4.5A2.75 2.75 0 0 0 13 10.25v-4.5A2.75 2.75 0 0 0 10.25 3h-4.5Zm8 0A2.75 2.75 0 0 0 11 5.75v12.5A2.75 2.75 0 0 0 13.75 21h4.5A2.75 2.75 0 0 0 21 18.25V5.75A2.75 2.75 0 0 0 18.25 3h-4.5ZM5.75 14A2.75 2.75 0 0 0 3 16.75v1.5A2.75 2.75 0 0 0 5.75 21h4.5A2.75 2.75 0 0 0 13 18.25v-1.5A2.75 2.75 0 0 0 10.25 14h-4.5Z"
      />
    </IconBase>
  );
}
