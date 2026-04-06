import type { ReactNode } from "react";
import Svg, { Path } from "react-native-svg";

type IconProps = {
  size?: number;
  color?: string;
};

function IconBase({
  size = 20,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

export function FeedSolidIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size}>
      <Path
        fill={color}
        d="M12 2.75a2.5 2.5 0 0 0-1.77.73l-6.5 6.5A2.5 2.5 0 0 0 3 11.75v7A2.25 2.25 0 0 0 5.25 21H9.5a.75.75 0 0 0 .75-.75v-4a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v4a.75.75 0 0 0 .75.75h4.25A2.25 2.25 0 0 0 21 18.75v-7a2.5 2.5 0 0 0-.73-1.77l-6.5-6.5A2.5 2.5 0 0 0 12 2.75Z"
      />
    </IconBase>
  );
}

export function ChatsSolidIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size}>
      <Path
        fill={color}
        d="M5.75 4A3.75 3.75 0 0 0 2 7.75v6A3.75 3.75 0 0 0 5.75 17.5h1.97c.3 0 .6.11.82.31l2.82 2.35c1.05.88 2.64.13 2.64-1.24v-.67c0-.41.34-.75.75-.75h2.5A3.75 3.75 0 0 0 21 13.75v-6A3.75 3.75 0 0 0 17.25 4H5.75Zm2 4.25c0-.41.34-.75.75-.75h6.5a.75.75 0 0 1 0 1.5H8.5a.75.75 0 0 1-.75-.75Zm0 3.5c0-.41.34-.75.75-.75h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1-.75-.75Z"
      />
    </IconBase>
  );
}

export function ArticlesSolidIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size}>
      <Path
        fill={color}
        d="M5.5 3.25A2.25 2.25 0 0 0 3.25 5.5v13A2.25 2.25 0 0 0 5.5 20.75h13A2.25 2.25 0 0 0 20.75 18.5V9.44a2.25 2.25 0 0 0-.66-1.59l-3.94-3.94a2.25 2.25 0 0 0-1.59-.66H5.5Z"
      />
      <Path
        fill={color}
        opacity={0.3}
        d="M14.75 3.25V7.5A1.25 1.25 0 0 0 16 8.75h4.75"
      />
      <Path
        fill={color}
        d="M7.75 11c0-.41.34-.75.75-.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1-.75-.75Zm0 3.75c0-.41.34-.75.75-.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1-.75-.75Zm0 3.75c0-.41.34-.75.75-.75H13a.75.75 0 0 1 0 1.5H8.5a.75.75 0 0 1-.75-.75Z"
      />
    </IconBase>
  );
}

export function CoursesSolidIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size}>
      <Path
        fill={color}
        d="M12 3.1 2.95 7.27a.75.75 0 0 0 0 1.36L12 12.8l9.05-4.17a.75.75 0 0 0 0-1.36L12 3.1Z"
      />
      <Path
        fill={color}
        opacity={0.92}
        d="M6 10.55v4.2c0 .84.48 1.61 1.24 1.97l3.76 1.78c.63.3 1.37.3 2 0l3.76-1.78A2.2 2.2 0 0 0 18 14.75v-4.2L12.31 13.2a.75.75 0 0 1-.62 0L6 10.55Z"
      />
      <Path
        fill={color}
        opacity={0.42}
        d="M19.5 9.6v5.15a.75.75 0 0 0 1.5 0V8.9l-1.5.7Z"
      />
    </IconBase>
  );
}

export function AdminSolidIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <IconBase size={size}>
      <Path
        fill={color}
        d="M5.5 3A2.5 2.5 0 0 0 3 5.5v4A2.5 2.5 0 0 0 5.5 12h4A2.5 2.5 0 0 0 12 9.5v-4A2.5 2.5 0 0 0 9.5 3h-4Zm9 0A2.5 2.5 0 0 0 12 5.5v4a2.5 2.5 0 0 0 2.5 2.5h4A2.5 2.5 0 0 0 21 9.5v-4A2.5 2.5 0 0 0 18.5 3h-4Zm-9 9A2.5 2.5 0 0 0 3 14.5v4A2.5 2.5 0 0 0 5.5 21h4a2.5 2.5 0 0 0 2.5-2.5v-4A2.5 2.5 0 0 0 9.5 12h-4Zm9 0a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 2.5 2.5h4a2.5 2.5 0 0 0 2.5-2.5v-4a2.5 2.5 0 0 0-2.5-2.5h-4Z"
      />
    </IconBase>
  );
}
