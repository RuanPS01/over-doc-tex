import { LogOut, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { useAuth } from '../hooks/use-auth';
import { ProfileDialog } from './profile-dialog';

/** Primeira letra do nome (ou do e-mail) para o botão quando a conta não tem foto. */
function initialOf(name: string | null, email: string | null): string {
  return (name?.trim() || email || '?').charAt(0).toUpperCase();
}

/** Botão da conta no cabeçalho: nome e e-mail, "Perfil" (nome e senha) e "Sair". */
export function AccountMenu({ className }: { className?: string }) {
  const { t } = useT();
  const { user, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  if (!user) return null;
  const label = user.displayName?.trim() || user.email || t('Sua conta');

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('shrink-0 rounded-full', className)} aria-label={t('Conta: {name}', { name: label })} title={label}>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full object-cover" />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initialOf(user.displayName, user.email)}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="flex min-w-0 flex-col gap-0.5 font-normal">
            <span className="truncate font-medium">{user.displayName?.trim() || t('Sem nome')}</span>
            {user.email && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onSelect={() => setProfileOpen(true)}>
            <UserRound className="size-4 text-muted-foreground" />
            {t('Perfil')}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onSelect={() => void signOut()}>
            <LogOut className="size-4 text-muted-foreground" />
            {t('Sair da conta')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
