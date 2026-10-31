import { Bell, CheckCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useNotifications } from '../hooks/use-notifications';

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Sino com as notificações (revisões abertas, comentários, status); o clique abre a revisão e marca como lida. */
export function NotificationBell({ className }: { className?: string }) {
  const { items, unread, markRead, markAllRead } = useNotifications();
  const [, navigate] = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
          aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 pr-1">
          <DropdownMenuLabel>Notificações</DropdownMenuLabel>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void markAllRead(items)}>
              <CheckCheck />
              Marcar como lidas
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nada por aqui ainda.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className="flex flex-col items-start gap-0.5"
                onSelect={() => {
                  if (!item.read) void markRead(item.id);
                  if (item.reviewId) navigate(`/p/${item.projectId}/reviews/${item.reviewId}`);
                  else navigate(`/p/${item.projectId}`);
                }}
              >
                <span className={cn('flex w-full min-w-0 items-center gap-2 text-sm', !item.read && 'font-semibold')}>
                  {!item.read && <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />}
                  <span className="min-w-0 truncate">{item.title}</span>
                </span>
                {item.body && <span className="line-clamp-2 w-full text-xs text-muted-foreground">{item.body}</span>}
                {item.createdAt && <span className="text-[11px] text-muted-foreground">{TIME_FORMAT.format(item.createdAt)}</span>}
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
