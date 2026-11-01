import { describe, expect, it } from 'vitest';
import type { ReviewDoc } from '@shared/firestore/types';
import { accountGuestKey, guestKeyOf, newLinkToken, parseEmails, reviewerLabel, reviewLinkUrl, toReviewSummary } from '@/features/review/model/review';

const timestamp = { toDate: () => new Date(0), toMillis: () => 0 };

describe('revisão pelo link', () => {
  it('o mesmo nome, com outra grafia, é o mesmo revisor', () => {
    expect(guestKeyOf('Maria  Souza')).toBe('maria souza');
    expect(guestKeyOf(' maria souza ')).toBe('maria souza');
    expect(guestKeyOf('Márcia Conceição')).toBe('marcia conceicao');
    expect(guestKeyOf('***')).toBe('');
  });

  it('código do link: 32 caracteres seguros para URL e diferente a cada vez', () => {
    const token = newLinkToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newLinkToken()).not.toBe(token);
  });

  it('link leva o código e a versão, respeitando o subcaminho do site', () => {
    expect(reviewLinkUrl('https://x.app', '/over-doc-tex/', { projectId: 'p1', id: 'r1', snapshotId: 's1' }, 'abc')).toBe(
      'https://x.app/over-doc-tex/p/p1/reviews/r1?k=abc&v=s1',
    );
  });

  it('e-mails de um campo livre: válidos, em minúsculas e sem repetição', () => {
    expect(parseEmails('Ana@Uni.br, bia@uni.br; ana@uni.br\nerrado')).toEqual({ valid: ['ana@uni.br', 'bia@uni.br'], invalid: ['errado'] });
  });

  it('revisão antiga vale "só e-mails", com o e-mail da criação na lista', () => {
    const old = { reviewerEmail: 'rev@uni.br', reviewerName: null, requestedAt: timestamp, lastActivityAt: timestamp, closedAt: null } as unknown as ReviewDoc;
    const summary = toReviewSummary('p1', 'r1', old);
    expect(summary.access).toBe('email');
    expect(summary.reviewerEmails).toEqual(['rev@uni.br']);
    expect(reviewerLabel(summary)).toBe('rev@uni.br');
    expect(reviewerLabel({ reviewerName: null, reviewerEmails: [], access: 'link' })).toBe('Revisão pelo link');
    expect(reviewerLabel({ reviewerName: null, reviewerEmails: ['a@x.br', 'b@x.br'], access: 'email' })).toBe('a@x.br +1');
    expect(reviewerLabel({ reviewerName: 'Maria', reviewerEmails: [], access: 'link' })).toBe('Maria');
  });

  it('a chave de quem entra com a conta não sai de nenhum nome digitado', () => {
    expect(accountGuestKey('AbC123')).toBe('uid:AbC123');
    expect(guestKeyOf('uid:AbC123')).not.toBe(accountGuestKey('AbC123'));
    expect(guestKeyOf('uid:AbC123')).not.toContain(':');
  });
});
