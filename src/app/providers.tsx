import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/components/auth-provider';
import { useMediaQuery } from '@/hooks/use-media-query';

/** Aplica a classe `dark` no <html> conforme a preferência do sistema. */
function ThemeSync() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', prefersDark);
  }, [prefersDark]);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeSync />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
