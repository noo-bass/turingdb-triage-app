// Line icons drawn inline (no emoji, no icon font). 24-unit grid, stroked in
// the current text colour so they follow the theme, including red night mode.

import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'plus'
  | 'back'
  | 'undo'
  | 'chevron'
  | 'check'
  | 'cross'
  | 'help'
  | 'info'
  | 'camera'
  | 'clock'
  | 'moon'
  | 'sun'
  | 'alert'
  | 'list'
  | 'medic';

const PATHS: Record<IconName, (c: string) => React.ReactNode> = {
  plus: () => <Path d="M12 4v16M4 12h16" />,
  back: () => <Path d="M15 4l-8 8 8 8" />,
  undo: () => <Path d="M9 7H4V2M4 7a9 9 0 1 1-1 7" />,
  chevron: () => <Path d="M9 4l8 8-8 8" />,
  check: () => <Path d="M4 12l5 5L20 6" />,
  cross: () => <Path d="M5 5l14 14M19 5L5 19" />,
  help: () => (
    <>
      <Circle cx={12} cy={12} r={9.5} />
      <Path d="M9.2 9.3a2.9 2.9 0 1 1 3.6 2.8c-.5.2-.8.6-.8 1.1V14M12 17.2v.1" />
    </>
  ),
  info: () => (
    <>
      <Circle cx={12} cy={12} r={9.5} />
      <Path d="M12 11v6M12 7.3v.1" />
    </>
  ),
  camera: () => (
    <>
      <Rect x={2.5} y={6.5} width={19} height={14} rx={3} />
      <Path d="M8 6.5l1.5-3h5l1.5 3" />
      <Circle cx={12} cy={13.5} r={3.5} />
    </>
  ),
  clock: () => (
    <>
      <Circle cx={12} cy={12} r={9.5} />
      <Path d="M12 6.5V12l3.5 2.5" />
    </>
  ),
  moon: () => <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  sun: () => (
    <>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </>
  ),
  alert: () => <Path d="M12 3L2 20h20L12 3zM12 10v4.5M12 17.5v.1" />,
  list: () => <Path d="M8 6h13M8 12h13M8 18h13M3.5 6v.1M3.5 12v.1M3.5 18v.1" />,
  medic: () => (
    <>
      <Rect x={3} y={3} width={18} height={18} rx={3} />
      <Path d="M12 7.5v9M7.5 12h9" />
    </>
  ),
};

export function Icon({ name, color, size = 28 }: { name: IconName; color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round">
      {PATHS[name](color)}
    </Svg>
  );
}
