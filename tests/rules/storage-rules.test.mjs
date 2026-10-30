import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadString } from 'firebase/storage';
import { createTestEnv, runScenarios } from './harness.mjs';

const env = await createTestEnv();

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'projects/p1'), {
    members: { ana: 'owner', bia: 'editor', caio: 'viewer' },
    memberIds: ['ana', 'bia', 'caio'],
  });
  await setDoc(doc(db, 'projects/p1/snapshots/s1/grants/rev'), { documentIds: ['main'], reviewIds: ['r1'] });
  const storage = ctx.storage();
  await uploadString(ref(storage, 'projects/p1/snapshots/s1/main.pdf'), 'pdf');
  await uploadString(ref(storage, 'projects/p1/snapshots/s1/apendice.pdf'), 'pdf');
});

const storageAs = (uid) => env.authenticatedContext(uid).storage();
const sha = (char) => char.repeat(64);

await runScenarios('Storage', [
  ['revisor lê o PDF do documento concedido', () =>
    assertSucceeds(getBytes(ref(storageAs('rev'), 'projects/p1/snapshots/s1/main.pdf')))],
  ['revisor não lê documento secundário sem concessão', () =>
    assertFails(getBytes(ref(storageAs('rev'), 'projects/p1/snapshots/s1/apendice.pdf')))],
  ['editor envia blob com nome sha256', () =>
    assertSucceeds(uploadString(ref(storageAs('bia'), `projects/p1/blobs/${sha('a')}`), 'conteúdo'))],
  ['blob com nome inválido é negado', () =>
    assertFails(uploadString(ref(storageAs('bia'), 'projects/p1/blobs/nao-e-hash'), 'x'))],
  ['viewer não envia blob', () => assertFails(uploadString(ref(storageAs('caio'), `projects/p1/blobs/${sha('b')}`), 'x'))],
]);

await env.cleanup();
