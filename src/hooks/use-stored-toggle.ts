import { useCallback, useState } from 'react';

function read(key: string): boolean | null {
  try {
    const value = localStorage.getItem(key);
    return value === 'true' ? true : value === 'false' ? false : null;
  } catch {
    return null;
  }
}

/**
 * Liga e desliga lembrado neste navegador (painéis abertos ou fechados).
 * `null` enquanto a pessoa não escolheu: quem usa decide o padrão.
 */
export function useStoredToggle(key: string): [boolean | null, (value: boolean) => void] {
  const [value, setValue] = useState<boolean | null>(() => read(key));
  const save = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Sem armazenamento: vale só nesta aba.
      }
    },
    [key],
  );
  return [value, save];
}
