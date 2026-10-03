// Two palettes, both on black. "red" is night mode: every colour is a red,
// which protects night vision and light discipline. Categories never rely on
// colour alone: each also has its word and a shape (see CategoryBadge).

export type Mode = 'dark' | 'red';

export type Palette = {
  background: string;
  surface: string;
  surfacePressed: string;
  border: string;
  text: string;
  textMuted: string;
  yes: string;
  no: string;
  onAnswer: string;
  accent: string;
  warning: string;
  category: Record<'immediate' | 'delayed' | 'minimal' | 'expectant' | 'unranked', string>;
};

const dark: Palette = {
  background: '#000000',
  surface: '#161616',
  surfacePressed: '#2a2a2a',
  border: '#3a3a3a',
  text: '#ffffff',
  textMuted: '#a0a0a0',
  yes: '#1f7a3a',
  no: '#8a1c1c',
  onAnswer: '#ffffff',
  accent: '#4da3ff',
  warning: '#ffb020',
  category: {
    immediate: '#ff453a',
    delayed: '#ffd60a',
    minimal: '#32d74b',
    expectant: '#8e8e93',
    unranked: '#ffffff',
  },
};

const red: Palette = {
  background: '#000000',
  surface: '#1a0000',
  surfacePressed: '#330000',
  border: '#4d0000',
  text: '#ff3b30',
  textMuted: '#a32019',
  yes: '#5c0000',
  no: '#2b0000',
  onAnswer: '#ff3b30',
  accent: '#ff3b30',
  warning: '#ff3b30',
  category: {
    immediate: '#ff3b30',
    delayed: '#ff3b30',
    minimal: '#ff3b30',
    expectant: '#a32019',
    unranked: '#ff3b30',
  },
};

export const palettes: Record<Mode, Palette> = { dark, red };

// Sized for gloves and tired hands: nothing tappable under 72 pt
export const size = {
  gutter: 16,
  radius: 18,
  minTarget: 72,
  text: 20,
  textLarge: 28,
  button: 24,
  question: 34,
  answer: 40,
  // iOS Larger Text still grows type, but the base sizes are already large,
  // so past this the rows stop fitting a phone width
  maxTextScale: 1.3,
};
