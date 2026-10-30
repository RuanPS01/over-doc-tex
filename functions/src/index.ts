/**
 * Ponto de entrada das Cloud Functions (2ª geração).
 *
 * Aqui ficam apenas rotas leves e o stream de IA. Compilação LaTeX, snapshot
 * e diff rodam no serviço `latex-worker` (Cloud Run com TeX Live), descrito em
 * docs/01-arquitetura.md e docs/07-fluxos.md.
 */
import { initializeApp } from 'firebase-admin/app';
import { defineList, defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { handleAiStream } from './ai/stream-handler';

initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 20 });

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const allowedOrigins = defineList('ALLOWED_ORIGINS', {
  default: ['http://localhost:5173'],
  description: 'Origens autorizadas para CORS.',
});

/**
 * Stream NDJSON da IA. O cliente chama a URL da função diretamente (não pelo
 * rewrite do Hosting), porque o proxy do Hosting tem limite de 60 s.
 */
export const aiStream = onRequest(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 540,
    memory: '1GiB',
    concurrency: 40,
    cors: allowedOrigins,
  },
  (req, res) => handleAiStream(req, res, { apiKey: anthropicApiKey.value() }),
);
