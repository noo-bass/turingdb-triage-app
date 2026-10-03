// The doctrine, loaded once from the on-device graph at startup (~60 ms).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { query } from '../graph/triageGraph.ts';
import { loadDoctrine, type Doctrine } from '../triage/doctrine.ts';

type Loaded = { doctrine: Doctrine | null; error: string | null; retry: () => void };

const DoctrineContext = createContext<Loaded>({ doctrine: null, error: null, retry: () => {} });

export function DoctrineProvider({ children }: { children: ReactNode }) {
  const [doctrine, setDoctrine] = useState<Doctrine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    loadDoctrine(query)
      .then(setDoctrine)
      .catch((e: unknown) => setError(String(e)));
  }, [attempt]);

  return (
    <DoctrineContext.Provider
      value={{
        doctrine,
        error,
        retry: () => {
          setError(null);
          setAttempt((n) => n + 1);
        },
      }}>
      {children}
    </DoctrineContext.Provider>
  );
}

export function useDoctrine(): Loaded {
  return useContext(DoctrineContext);
}
