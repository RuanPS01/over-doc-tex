import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

/**
 * Ambiente de teste apontando para os emuladores definidos em firebase.json.
 * As suítes rodam em sequência no mesmo emulador, então cada uma começa com
 * Firestore e Storage vazios: sem isso, o snapshot s2 criado pela suíte do
 * Firestore fazia a do Storage tratar a versão como já congelada.
 */
export async function createTestEnv() {
  const env = await initializeTestEnvironment({
    projectId: 'demo-overdoctex',
    firestore: { rules: read('firestore.rules'), host: '127.0.0.1', port: 8080 },
    storage: { rules: read('storage.rules'), host: '127.0.0.1', port: 9199 },
  });
  await env.clearFirestore();
  await env.clearStorage();
  return env;
}

/** Executa os cenários em sequência e encerra com código 1 se algum falhar. */
export async function runScenarios(title, scenarios) {
  let failed = 0;
  for (const [name, run] of scenarios) {
    try {
      await run();
      console.log(`  ok    ${name}`);
    } catch (error) {
      failed++;
      console.log(`  FALHA ${name}: ${String(error?.message ?? error).split('\n')[0]}`);
    }
  }
  console.log(`${title}: ${scenarios.length - failed}/${scenarios.length} cenários aprovados`);
  if (failed > 0) process.exitCode = 1;
}
