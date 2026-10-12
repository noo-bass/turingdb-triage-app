// App state: the casualties, the display mode and the settings. Saved to a
// file after every change, so a killed app or a dead phone loses nothing.
// Casualties live only here, never in the graph (decision 2).

import { File, Paths } from 'expo-file-system';
import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';

import {
  answer,
  answerKit,
  answerRecheck,
  answerTourniquet,
  newCasualty,
  undo,
  type Answer,
  type Casualty,
  type TourniquetWindow,
} from '../triage/assess.ts';
import type { Mode } from '../ui/theme.ts';
import { prunePhotos } from './photos.ts';

export type State = {
  casualties: Casualty[];
  mode: Mode;
  nextNumber: number; // C1, C2, ... never reused (until reset), so names stay unambiguous
  tieHistory: string[]; // casualty ids in tie-break answer order, for undo on the ties screen
  showGraph: boolean; // the TuringDB graph above the questions (Settings)
};

type Action =
  | { type: 'start'; count: number; now: number }
  | { type: 'add'; id: string; now: number }
  | { type: 'reset' }
  | { type: 'tieTourniquet'; id: string; window: TourniquetWindow | 'none' }
  | { type: 'tieRecheck'; id: string; value: Answer }
  | { type: 'tieUndo' }
  | { type: 'photo'; id: string; name: string }
  | { type: 'answer'; id: string; question: string; value: Answer }
  | { type: 'kit'; id: string; kit: string; has: boolean }
  | { type: 'undo'; id: string }
  | { type: 'tourniquet'; id: string; now: number }
  | { type: 'evacuated'; id: string }
  | { type: 'mode'; mode: Mode }
  | { type: 'showGraph'; show: boolean };

const INITIAL: State = { casualties: [], mode: 'dark', nextNumber: 1, tieHistory: [], showGraph: false };

function reduce(state: State, action: Action): State {
  const update = (id: string, f: (c: Casualty) => Casualty) => ({
    ...state,
    casualties: state.casualties.map((c) => (c.id === id ? f(c) : c)),
  });

  switch (action.type) {
    case 'start': {
      const fresh = Array.from({ length: action.count }, (_, i) =>
        newCasualty(`c${action.now}-${i}`, `C${state.nextNumber + i}`, action.now + i),
      );
      return {
        ...state,
        nextNumber: state.nextNumber + action.count,
        casualties: [...state.casualties, ...fresh],
      };
    }
    case 'reset':
      // everything but the display settings: they should survive a new incident
      return { ...INITIAL, mode: state.mode, showGraph: state.showGraph };
    case 'tieTourniquet':
      return {
        ...update(action.id, (c) => answerTourniquet(c, action.window)),
        tieHistory: [...state.tieHistory, action.id],
      };
    case 'tieRecheck':
      return {
        ...update(action.id, (c) => answerRecheck(c, action.value)),
        tieHistory: [...state.tieHistory, action.id],
      };
    case 'photo':
      return update(action.id, (c) => ({ ...c, photo: action.name }));
    case 'tieUndo': {
      const id = state.tieHistory.at(-1);
      return id === undefined ? state : { ...update(id, undo), tieHistory: state.tieHistory.slice(0, -1) };
    }
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
    case 'mode':
      return { ...state, mode: action.mode };
    case 'showGraph':
      return { ...state, showGraph: action.show };
  }
}

const SAVE_FILE = 'triage-state.json';

function load(): State {
  try {
    const file = new File(Paths.document, SAVE_FILE);
    if (!file.exists) {
      return INITIAL;
    }
    const saved = { ...INITIAL, ...(JSON.parse(file.textSync()) as State) };
    // casualties saved by an older version lack the tie-break fields
    return {
      ...saved,
      casualties: saved.casualties.map((c) => ({
        ...c,
        tourniquetWindow: c.tourniquetWindow ?? null,
        recheck: c.recheck ?? null,
        photo: c.photo ?? null,
      })),
    };
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
  // photos of evacuated, reset or retaken casualties go once nothing uses them
  const inUse = state.casualties.map((c) => c.photo ?? '').join();
  useEffect(() => prunePhotos(new Set(inUse.split(','))), [inUse]);
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
