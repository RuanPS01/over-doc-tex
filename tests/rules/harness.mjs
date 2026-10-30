import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

/** Ambiente de teste apontando para os emuladores definidos em firebase.json. */
export function createTestEnv() {
  return initializeTestEnvironment({
    projectId: 'demo-overdoctex',
    firestore: { rules: read('firestore.rules'), host: '127.0.0.1', port: 8080 },
    storage: { rules: read('storage.rules'), host: '127.0.0.1', port: 9199 },
  });
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
