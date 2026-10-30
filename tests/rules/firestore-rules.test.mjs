import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { createTestEnv, runScenarios } from './harness.mjs';

const env = await createTestEnv();
await env.clearFirestore();

// Projeto p1: ana (owner), bia (editor), caio (viewer). "rev" é revisor externo da revisão r1.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'projects/p1'), {
    name: 'Tese',
    ownerId: 'ana',
    members: { ana: 'owner', bia: 'editor', caio: 'viewer' },
    memberIds: ['ana', 'bia', 'caio'],
    updatedAt: 1,
  });
  await setDoc(doc(db, 'projects/p1/snapshots/s1'), { label: '1.0' });
  await setDoc(doc(db, 'projects/p1/snapshots/s1/grants/rev'), { documentIds: ['main'], reviewIds: ['r1'] });
  await setDoc(doc(db, 'projects/p1/reviews/r1'), {
    reviewerUid: 'rev',
    snapshotId: 's1',
    grantedDocumentIds: ['main'],
    status: 'in_review',
    lastActivityAt: 1,
  });
  await setDoc(doc(db, 'projects/p1/reviews/r1/threads/t0'), { projectId: 'p1', reviewId: 'r1', status: 'open' });
  await setDoc(doc(db, 'projects/p1/aiConversations/c1'), { createdBy: 'bia', title: 'x' });
  await setDoc(doc(db, 'projects/p1/aiConversations/c1/messages/m1'), { role: 'user', content: 'oi' });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const pinThread = (overrides = {}) => ({
  projectId: 'p1',
  reviewId: 'r1',
  snapshotId: 's1',
  documentId: 'main',
  kind: 'pin',
  anchor: {
    type: 'pin',
    page: 2,
    point: { x: 0.4, y: 0.3 },
    drawing: {
      strokes: [{ tool: 'pen', color: 'annotation-2', width: 0.004, points: [0.1, 0.2, 0.15, 0.25] }],
      bounds: { x: 0.1, y: 0.2, width: 0.05, height: 0.05 },
    },
  },
  status: 'open',
  resolution: null,
  createdBy: 'rev',
  createdByRole: 'reviewer',
  commentCount: 0,
  participantIds: ['rev'],
  ...overrides,
});

await runScenarios('Firestore', [
  ['dono cria projeto com membros corretos', () =>
    assertSucceeds(setDoc(doc(as('zed'), 'projects/p2'), { ownerId: 'zed', members: { zed: 'owner' }, memberIds: ['zed'], name: 'n' }))],
  ['criar projeto com membro extra é negado', () =>
    assertFails(setDoc(doc(as('zed'), 'projects/p3'), { ownerId: 'zed', members: { zed: 'owner', x: 'editor' }, memberIds: ['zed'], name: 'n' }))],
  ['não membro não lê o projeto', () => assertFails(getDoc(doc(as('rev'), 'projects/p1')))],
  ['membro lista projetos por memberIds', () =>
    assertSucceeds(getDocs(query(collection(as('caio'), 'projects'), where('memberIds', 'array-contains', 'caio'))))],
  ['editor cria arquivo', () =>
    assertSucceeds(setDoc(doc(as('bia'), 'projects/p1/files/f1'), { path: 'a.tex', content: 'x', updatedBy: 'bia' }))],
  ['viewer não cria arquivo', () =>
    assertFails(setDoc(doc(as('caio'), 'projects/p1/files/f2'), { path: 'b.tex', content: 'x', updatedBy: 'caio' }))],
  ['editor não altera membros', () =>
    assertFails(updateDoc(doc(as('bia'), 'projects/p1'), { members: { ana: 'owner', bia: 'owner' } }))],
  ['cliente não altera snapshot (imutável)', () =>
    assertFails(updateDoc(doc(as('ana'), 'projects/p1/snapshots/s1'), { label: '9.9' }))],
  ['revisor com grant lê o snapshot', () => assertSucceeds(getDoc(doc(as('rev'), 'projects/p1/snapshots/s1')))],
  ['usuário sem grant não lê o snapshot', () => assertFails(getDoc(doc(as('zed'), 'projects/p1/snapshots/s1')))],
  ['revisor cria thread com pin e desenho', () =>
    assertSucceeds(setDoc(doc(as('rev'), 'projects/p1/reviews/r1/threads/t1'), pinThread()))],
  ['thread em documento não concedido é negada', () =>
    assertFails(setDoc(doc(as('rev'), 'projects/p1/reviews/r1/threads/t2'), pinThread({ documentId: 'apendice' })))],
  ['thread em outro snapshot é negada', () =>
    assertFails(setDoc(doc(as('rev'), 'projects/p1/reviews/r1/threads/t3'), pinThread({ snapshotId: 's2' })))],
  ['thread com autor falso é negada', () =>
    assertFails(setDoc(doc(as('rev'), 'projects/p1/reviews/r1/threads/t4'), pinThread({ createdBy: 'ana' })))],
  ['estranho não lê threads', () => assertFails(getDoc(doc(as('zed'), 'projects/p1/reviews/r1/threads/t0')))],
  ['revisor comenta', () =>
    assertSucceeds(setDoc(doc(as('rev'), 'projects/p1/reviews/r1/threads/t0/comments/c1'), { authorId: 'rev', kind: 'comment', body: 'Figura 2 sem legenda' }))],
  ['comentário com authorId falso é negado', () =>
    assertFails(setDoc(doc(as('rev'), 'projects/p1/reviews/r1/threads/t0/comments/c2'), { authorId: 'ana', kind: 'comment', body: 'x' }))],
  ['editor resolve thread para a próxima versão', () =>
    assertSucceeds(updateDoc(doc(as('bia'), 'projects/p1/reviews/r1/threads/t0'), {
      status: 'resolved',
      resolution: { kind: 'fixed_next_version', by: 'bia', at: serverTimestamp(), fixedInSnapshotId: null },
      updatedAt: serverTimestamp(),
    }))],
  ['revisor aprova a revisão', () =>
    assertSucceeds(updateDoc(doc(as('rev'), 'projects/p1/reviews/r1'), { status: 'approved', lastActivityAt: serverTimestamp() }))],
  ['revisor não amplia os documentos concedidos', () =>
    assertFails(updateDoc(doc(as('rev'), 'projects/p1/reviews/r1'), { grantedDocumentIds: ['main', 'apendice'] }))],
  ['revisor lista "minhas revisões" (collectionGroup)', () =>
    assertSucceeds(getDocs(query(collectionGroup(as('rev'), 'reviews'), where('reviewerUid', '==', 'rev'))))],
  ['criadora lê as mensagens da conversa de IA', () =>
    assertSucceeds(getDoc(doc(as('bia'), 'projects/p1/aiConversations/c1/messages/m1')))],
  ['outro membro não lê conversa alheia', () =>
    assertFails(getDoc(doc(as('ana'), 'projects/p1/aiConversations/c1/messages/m1')))],
]);

await env.cleanup();
