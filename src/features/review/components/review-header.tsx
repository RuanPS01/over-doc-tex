import { ArrowLeft, CheckCircle2, GitCompare, MoreVertical, RotateCcw, Share2, TriangleAlert, UserRound, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { LanguageMenu } from '@/components/common/language-menu';
import { ThemeMenu } from '@/components/common/theme-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ParticipantRole, ReviewStatus } from '@shared/firestore/types';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { useT } from '@/hooks/use-t';
import { msg } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { REVIEW_STATUS_LABELS, reviewerLabel, type ReviewSummary } from '../model/review';

interface StatusAction {
  status: ReviewStatus;
  /** Chave de tradução (msg): mostrada com t(). */
  label: string;
  icon: ReactNode;
}

/** O que cada lado pode fazer a partir do status atual (as mesmas transições das regras). */
function statusActions(role: ParticipantRole, status: ReviewStatus): StatusAction[] {
  if (role === 'author') {
    return status === 'closed'
      ? [{ status: 'in_review', label: msg('Reabrir'), icon: <RotateCcw /> }]
      : [{ status: 'closed', label: msg('Encerrar revisão'), icon: <XCircle /> }];
  }
  if (status === 'closed' || status === 'invited') return [];
  const actions: StatusAction[] = [];
  if (status !== 'changes_requested') actions.push({ status: 'changes_requested', label: msg('Pedir alterações'), icon: <TriangleAlert /> });
  if (status !== 'approved') actions.push({ status: 'approved', label: msg('Aprovar'), icon: <CheckCircle2 /> });
  return actions;
}

interface ReviewHeaderProps {
  review: ReviewSummary;
  role: ParticipantRole;
  onShowChanges: () => void;
  onStatusChange: (status: ReviewStatus) => void;
  /** Dono e editores: abre o "Envio da revisão" (e-mails e tipo de acesso). */
  onOpenSharing?: () => void;
  /** Revisor pelo link: nome com que ele comenta, e como trocar. */
  guestName?: string | null;
  onChangeGuestName?: () => void;
}

/** Cabeçalho travado da revisão: versão, status e ações do autor ou do revisor. */
export function ReviewHeader({ review, role, onShowChanges, onStatusChange, onOpenSharing, guestName, onChangeGuestName }: ReviewHeaderProps) {
  const { t } = useT();
  const actions = statusActions(role, review.status);
  const backHref = role === 'author' ? `/p/${review.projectId}` : '/';
  // Quem entrou pelo link não tem lista de projetos para onde voltar.
  const showBack = !guestName;

  return (
    <header className="flex h-header shrink-0 items-center gap-1 border-b bg-background px-2 pt-safe">
      {showBack && (
        <Button variant="ghost" size="icon" asChild>
          <Link href={backHref} aria-label={role === 'author' ? t('Voltar ao editor') : t('Voltar aos projetos')}>
            <ArrowLeft />
          </Link>
        </Button>
      )}
      <div className="min-w-0 flex-1 px-1">
        <h1 className="truncate text-sm font-semibold">
          #{review.number} {review.title}
        </h1>
        <p className="truncate text-xs text-muted-foreground">
          {t('Versão {version}', { version: review.snapshotLabel })} · {t(REVIEW_STATUS_LABELS[review.status])}
          {role === 'author' ? ` · ${reviewerLabel(review)}` : ` · ${review.projectName}`}
        </p>
      </div>
      {review.baseSnapshotId && (
        <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={onShowChanges}>
          <GitCompare />
          {t('Ver alterações')}
        </Button>
      )}
      {actions.map((action) => (
        <Button
          key={action.status}
          size="sm"
          variant={action.status === 'approved' ? 'default' : 'outline'}
          className="hidden lg:inline-flex"
          onClick={() => onStatusChange(action.status)}
        >
          {action.icon}
          {t(action.label)}
        </Button>
      ))}
      {guestName && onChangeGuestName && (
        <Button variant="ghost" size="sm" className="max-w-[40%] shrink" title={t('Trocar o nome com que você comenta')} onClick={onChangeGuestName}>
          <UserRound />
          <span className="truncate">{guestName}</span>
        </Button>
      )}
      {onOpenSharing && (
        <Button variant="outline" size="sm" className="px-2 sm:px-3" aria-label={t('Envio da revisão')} title={t('E-mails convidados e tipo de acesso')} onClick={onOpenSharing}>
          <Share2 />
          <span className="hidden sm:inline">{t('Envio')}</span>
        </Button>
      )}
      <LanguageMenu />
      <ThemeMenu />
      {!guestName && <NotificationBell />}
      {(actions.length > 0 || review.baseSnapshotId) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('Mais ações')} className={cn('lg:hidden', actions.length === 0 && 'md:hidden')}>
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {review.baseSnapshotId && (
              <DropdownMenuItem className="md:hidden" onSelect={onShowChanges}>
                <GitCompare />
                {t('Ver alterações')}
              </DropdownMenuItem>
            )}
            {actions.map((action) => (
              <DropdownMenuItem key={action.status} className="lg:hidden" onSelect={() => onStatusChange(action.status)}>
                {action.icon}
                {t(action.label)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
