/**
 * Verificador de links das referências.
 *
 * Proteções contra SSRF: só http/https, sem credenciais na URL, resolução DNS
 * com bloqueio de faixas privadas a cada salto de redirecionamento e leitura
 * limitada do corpo. Em produção, rode esta função com egress restrito
 * (VPC + Cloud NAT + firewall), pois a checagem de DNS não elimina
 * DNS rebinding sozinha.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LinkStatus } from '@shared/ai/schemas';

export interface LinkCheck {
  url: string;
  status: Exclude<LinkStatus, 'no_url'>;
  httpStatus: number | null;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  snippet: string | null;
}

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 64 * 1024;
const USER_AGENT = 'OverDocTeX-LinkChecker/0.1';

function isPrivateIPv4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  const normalized = ip.toLowerCase();
  if (normalized.startsWith('::ffff:')) return isPrivateIPv4(normalized.slice(7));
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80')
  );
}

async function isPublicTarget(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (bytes < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function summarizeHtml(html: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1];
  const snippet = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  return {
    title: title ? decodeEntities(title.trim()).slice(0, 300) : null,
    description: description ? decodeEntities(description).slice(0, 500) : null,
    snippet: snippet ? decodeEntities(snippet) : null,
  };
}

export async function checkLink(rawUrl: string, timeoutMs = 8_000): Promise<LinkCheck> {
  const base: LinkCheck = {
    url: rawUrl,
    status: 'broken',
    httpStatus: null,
    finalUrl: null,
    title: null,
    description: null,
    snippet: null,
  };

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return base;
  }

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await isPublicTarget(current))) return { ...base, status: 'blocked' };

      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' },
      });

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        current = new URL(location, current);
        continue;
      }

      const ok = response.status < 400;
      const isHtml = (response.headers.get('content-type') ?? '').includes('text/html');
      const summary = ok && isHtml ? summarizeHtml(await readLimited(response)) : null;
      if (!summary) await response.body?.cancel();

      return {
        ...base,
        status: ok ? (hop > 0 ? 'redirected' : 'ok') : 'broken',
        httpStatus: response.status,
        finalUrl: current.toString(),
        title: summary?.title ?? null,
        description: summary?.description ?? null,
        snippet: summary?.snippet ?? null,
      };
    }
    return base;
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return { ...base, status: timedOut ? 'timeout' : 'broken' };
  }
}

/** Verifica vários links com concorrência limitada. */
export async function checkLinks(urls: readonly string[], concurrency = 6): Promise<Map<string, LinkCheck>> {
  const results = new Map<string, LinkCheck>();
  const queue = [...new Set(urls)];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      results.set(url, await checkLink(url));
    }
  });
  await Promise.all(workers);
  return results;
}
