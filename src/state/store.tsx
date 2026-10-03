// App state: the casualties, the seat count and the display mode. Saved to a
// file after every change, so a killed app or a dead phone loses nothing.
// Casualties live only here, never in the graph (decision 2).

import { File, Paths } from 'expo-file-system';
import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';

import { answer, answerKit, newCasualty, undo, type Answer, type Casualty } from '../triage/assess.ts';
import type { Mode } from '../ui/theme.ts';

export type State = {
  casualties: Casualty[];
  seats: number;
  mode: Mode;
  nextNumber: number; // C1, C2, ... never reused, so names stay unambiguous
};

type Action =
  | { type: 'add'; id: string; now: number }
  | { type: 'answer'; id: string; question: string; value: Answer }
  | { type: 'kit'; id: string; kit: string; has: boolean }
  | { type: 'undo'; id: string }
  | { type: 'tourniquet'; id: string; now: number }
  | { type: 'evacuated'; id: string }
  | { type: 'seats'; seats: number }
  | { type: 'mode'; mode: Mode };

const INITIAL: State = { casualties: [], seats: 3, mode: 'dark', nextNumber: 1 };

function reduce(state: State, action: Action): State {
  const update = (id: string, f: (c: Casualty) => Casualty) => ({
    ...state,
    casualties: state.casualties.map((c) => (c.id === id ? f(c) : c)),
  });

  switch (action.type) {
    case 'add': {
      const n = state.nextNumber;
      return {
        ...state,
        nextNumber: n + 1,
        casualties: [...state.casualties, newCasualty(action.id, `C${n}`, action.now)],
      };
    }
    case 'answer':
      return update(action.id, (c) => answer(c, action.question, action.value));
    case 'kit':
      return update(action.id, (c) => answerKit(c, action.kit, action.has));
    case 'undo':
      return update(action.id, undo);
    case 'tourniquet':
      // The first time is kept: a tourniquet is never removed, only timed (decision 7)
      return update(action.id, (c) => (c.tourniquetAt === null ? { ...c, tourniquetAt: action.now } : c));
    case 'evacuated':
      return { ...state, casualties: state.casualties.filter((c) => c.id !== action.id) };
    case 'seats':
      return { ...state, seats: Math.max(0, Math.min(20, action.seats)) };
    case 'mode':
      return { ...state, mode: action.mode };
  }
}

const SAVE_FILE = 'triage-state.json';

function load(): State {
  try {
    const file = new File(Paths.document, SAVE_FILE);
    return file.exists ? { ...INITIAL, ...(JSON.parse(file.textSync()) as State) } : INITIAL;
  } catch {
    return INITIAL;
  }
}

function save(state: State) {
  try {
    new File(Paths.document, SAVE_FILE).write(JSON.stringify(state));
  } catch {
    // keep going: the in-memory state is still correct
  }
}

const Store = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, load);
  useEffect(() => save(state), [state]);
  return <Store.Provider value={{ state, dispatch }}>{children}</Store.Provider>;
}

export function useStore() {
  const store = useContext(Store);
  if (!store) {
    throw new Error('useStore outside StoreProvider');
  }
  return store;
}

export function useCasualty(id: string): Casualty | undefined {
  return useStore().state.casualties.find((c) => c.id === id);
}
