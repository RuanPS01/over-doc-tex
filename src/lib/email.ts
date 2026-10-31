/** E-mail válido o bastante para convite (o Firebase confere o resto), em minúsculas. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email) ? email : null;
}

/** Endereço de volta do link de acesso: a tela de login, que conclui a entrada e segue para `next`. */
export function emailLinkUrl(email: string, next: string): string {
  const url = new URL(`${import.meta.env.BASE_URL}login`, window.location.origin);
  url.searchParams.set('next', next);
  url.searchParams.set('email', email);
  return url.href;
}
