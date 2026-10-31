import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  FieldPath,
  arrayUnion,
  collection,
  collectionGroup,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { createTestEnv, runScenarios } from './harness.mjs';

const env = await createTestEnv();
await env.clearFirestore();

// p1: ana (owner), bia (editor), caio (viewer). rev@uni.br revisa a revisão r1 sobre o snapshot s1.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const project = (overrides = {}) => ({
    name: 'Tese',
    ownerId: 'ana',
    members: { ana: 'owner', bia: 'editor', caio: 'viewer' },
    memberIds: ['ana', 'bia', 'caio'],
    pendingMembers: {},
    counters: { snapshots: 1, reviews: 1 },
    latestSnapshotId: 's1',
    mainDocumentId: 'main',
    ...overrides,
  });
  await setDoc(doc(db, 'projects/p1'), project());
  await setDoc(doc(db, 'projects/p4'), project({ pendingMembers: { 'dani@uni.br': 'viewer' } }));
  await setDoc(doc(db, 'projects/p1/snapshots/s1'), { sequence: 1, label: '1.0' });
  await setDoc(doc(db, 'projects/p1/snapshots/s1/grants/rev@uni.br'), { documentIds: ['main'], grantedBy: 'ana' });
  await setDoc(doc(db, 'projects/p1/reviews/r1'), {
    number: 1,
    reviewerEmail: 'rev@uni.br',
    reviewerUid: null,
    snapshotId: 's1',
    grantedDocumentIds: ['main'],
    status: 'invited',
    lastActivityAt: 1,
  });
  await setDoc(doc(db, 'projects/p1/reviews/r1/threads/t0'), {
    projectId: 'p1', reviewId: 'r1', status: 'open', resolution: null, commentCount: 1, participantIds: ['rev'],
  });
  await setDoc(doc(db, 'projects/p1/reviews/r1/threads/t9'), {
    projectId: 'p1', reviewId: 'r1', status: 'resolved', commentCount: 2, participantIds: ['rev', 'bia'],
    resolution: { kind: 'fixed_next_version', by: 'bia', at: 1, fixedInSnapshotId: null },
  });
  await setDoc(doc(db, 'projects/p1/diffs/d1'), { targetSnapshotId: 's1', baseSnapshotId: 's0', createdBy: 'bia' });
  await setDoc(doc(db, 'projects/p1/aiConversations/c1'), { createdBy: 'bia', title: 'x' });
  await setDoc(doc(db, 'users/ana/private/ai'), { models: [] });
});

const as = (uid, token) => env.authenticatedContext(uid, token).firestore();
const rev = () => as('rev', { email: 'rev@uni.br', email_verified: true });
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

/** Congela uma versão: snapshot e contador do projeto no mesmo lote. */
function freeze(db, sid, sequence, counter = sequence) {
  const batch = writeBatch(db);
  batch.set(doc(db, `projects/p1/snapshots/${sid}`), { sequence, label: `1.${sequence - 1}`, createdBy: 'bia' });
  batch.update(doc(db, 'projects/p1'), { 'counters.snapshots': counter, latestSnapshotId: sid, updatedAt: serverTimestamp() });
  return batch.commit();
}

/** Abre uma revisão: grant do revisor, revisão numerada e contador no mesmo lote. */
function openReview(db, { withGrant = true, number = 2 } = {}) {
  const batch = writeBatch(db);
  if (withGrant) batch.set(doc(db, 'projects/p1/snapshots/s1/grants/nova@uni.br'), { documentIds: ['main'], grantedBy: 'bia' });
  batch.set(doc(db, 'projects/p1/reviews/r2'), {
    number, reviewerEmail: 'nova@uni.br', reviewerUid: null, snapshotId: 's1', grantedDocumentIds: ['main'],
    status: 'invited', requestedBy: 'bia', lastActivityAt: serverTimestamp(),
  });
  batch.update(doc(db, 'projects/p1'), { 'counters.reviews': number, updatedAt: serverTimestamp() });
  return batch.commit();
}

await runScenarios('Firestore', [
  ['dono cria projeto com membros e contadores zerados', () =>
    assertSucceeds(setDoc(doc(as('zed'), 'projects/p2'), {
      ownerId: 'zed', members: { zed: 'owner' }, memberIds: ['zed'], pendingMembers: {}, counters: { snapshots: 0, reviews: 0 }, name: 'n',
    }))],
  ['criar projeto com membro extra é negado', () =>
    assertFails(setDoc(doc(as('zed'), 'projects/p3'), {
      ownerId: 'zed', members: { zed: 'owner', x: 'editor' }, memberIds: ['zed'], counters: { snapshots: 0, reviews: 0 }, name: 'n',
    }))],
  ['criar projeto com contador adulterado é negado', () =>
    assertFails(setDoc(doc(as('zed'), 'projects/p5'), {
      ownerId: 'zed', members: { zed: 'owner' }, memberIds: ['zed'], counters: { snapshots: 5, reviews: 0 }, name: 'n',
    }))],
  ['não membro não lê o projeto', () => assertFails(getDoc(doc(rev(), 'projects/p1')))],
  ['membro lista projetos por memberIds', () =>
    assertSucceeds(getDocs(query(collection(as('caio'), 'projects'), where('memberIds', 'array-contains', 'caio'))))],
  ['editor cria arquivo', () =>
    assertSucceeds(setDoc(doc(as('bia'), 'projects/p1/files/f1'), { path: 'a.tex', content: 'x', updatedBy: 'bia' }))],
  ['viewer não cria arquivo', () =>
    assertFails(setDoc(doc(as('caio'), 'projects/p1/files/f2'), { path: 'b.tex', content: 'x', updatedBy: 'caio' }))],
  ['editor não altera membros', () =>
    assertFails(updateDoc(doc(as('bia'), 'projects/p1'), { members: { ana: 'owner', bia: 'owner', caio: 'viewer' } }))],
  ['dono convida coautor por e-mail', () =>
    assertSucceeds(updateDoc(doc(as('ana'), 'projects/p1'), new FieldPath('pendingMembers', 'eva@uni.br'), 'viewer'))],
  ['convite com papel de dono é negado', () =>
    assertFails(updateDoc(doc(as('ana'), 'projects/p1'), new FieldPath('pendingMembers', 'x@uni.br'), 'owner'))],
  ['convidada com e-mail verificado vê o projeto', () =>
    assertSucceeds(getDoc(doc(as('dani', { email: 'dani@uni.br', email_verified: true }), 'projects/p4')))],
  ['convidada com e-mail não verificado não aceita', () =>
    assertFails(updateDoc(doc(as('dani', { email: 'dani@uni.br', email_verified: false }), 'projects/p4'),
      new FieldPath('members', 'dani'), 'viewer', 'memberIds', arrayUnion('dani'), new FieldPath('pendingMembers', 'dani@uni.br'), deleteField()))],
  ['convidada não aceita com papel maior que o do convite', () =>
    assertFails(updateDoc(doc(as('dani', { email: 'dani@uni.br', email_verified: true }), 'projects/p4'),
      new FieldPath('members', 'dani'), 'editor', 'memberIds', arrayUnion('dani'), new FieldPath('pendingMembers', 'dani@uni.br'), deleteField()))],
  ['convidada aceita o convite e entra no projeto', () =>
    assertSucceeds(updateDoc(doc(as('dani', { email: 'dani@uni.br', email_verified: true }), 'projects/p4'),
      new FieldPath('members', 'dani'), 'viewer', 'memberIds', arrayUnion('dani'), new FieldPath('pendingMembers', 'dani@uni.br'), deleteField()))],
  ['editor congela versão (snapshot e contador no mesmo lote)', () => assertSucceeds(freeze(as('bia'), 's2', 2))],
  ['snapshot sem avançar o contador é negado', () =>
    assertFails(setDoc(doc(as('bia'), 'projects/p1/snapshots/s9'), { sequence: 3, createdBy: 'bia' }))],
  ['snapshot que pula a sequência é negado', () => assertFails(freeze(as('bia'), 's4', 4))],
  ['viewer não congela versão', () => assertFails(freeze(as('caio'), 's3', 3))],
  ['snapshot existente é imutável', () => assertFails(updateDoc(doc(as('ana'), 'projects/p1/snapshots/s1'), { label: '9.9' }))],
  ['editor abre revisão (grant, revisão e contador no mesmo lote)', () => assertSucceeds(openReview(as('bia')))],
  ['revisão sem grant do revisor é negada', () => assertFails(openReview(as('bia'), { withGrant: false, number: 3 }))],
  ['revisor com e-mail verificado lê o snapshot', () => assertSucceeds(getDoc(doc(rev(), 'projects/p1/snapshots/s1')))],
  ['revisor com e-mail não verificado não lê', () =>
    assertFails(getDoc(doc(as('rev', { email: 'rev@uni.br', email_verified: false }), 'projects/p1/snapshots/s1')))],
  ['outro e-mail não lê o snapshot', () =>
    assertFails(getDoc(doc(as('zed', { email: 'zed@uni.br', email_verified: true }), 'projects/p1/snapshots/s1')))],
  ['revisor abre a revisão e registra o próprio uid', () =>
    assertSucceeds(updateDoc(doc(rev(), 'projects/p1/reviews/r1'), { reviewerUid: 'rev', status: 'in_review', lastActivityAt: serverTimestamp() }))],
  ['revisor não amplia os documentos concedidos', () =>
    assertFails(updateDoc(doc(rev(), 'projects/p1/reviews/r1'), { grantedDocumentIds: ['main', 'apendice'] }))],
  ['revisor cria thread com pin e desenho', () =>
    assertSucceeds(setDoc(doc(rev(), 'projects/p1/reviews/r1/threads/t1'), pinThread()))],
  ['thread em documento não concedido é negada', () =>
    assertFails(setDoc(doc(rev(), 'projects/p1/reviews/r1/threads/t2'), pinThread({ documentId: 'apendice' })))],
  ['thread com autor falso é negada', () =>
    assertFails(setDoc(doc(rev(), 'projects/p1/reviews/r1/threads/t3'), pinThread({ createdBy: 'ana' })))],
  ['estranho não lê threads', () => assertFails(getDoc(doc(as('zed'), 'projects/p1/reviews/r1/threads/t0')))],
  ['revisor comenta e soma 1 ao contador no mesmo lote', () => {
    const db = rev();
    const batch = writeBatch(db);
    batch.set(doc(db, 'projects/p1/reviews/r1/threads/t0/comments/c1'), { authorId: 'rev', kind: 'comment', body: 'Figura 2 sem legenda' });
    batch.update(doc(db, 'projects/p1/reviews/r1/threads/t0'), { commentCount: 2, participantIds: arrayUnion('rev'), lastCommentAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return assertSucceeds(batch.commit());
  }],
  ['contador que pula de 2 em 2 é negado', () =>
    assertFails(updateDoc(doc(rev(), 'projects/p1/reviews/r1/threads/t0'), { commentCount: 4, updatedAt: serverTimestamp() }))],
  ['comentário com authorId falso é negado', () =>
    assertFails(setDoc(doc(rev(), 'projects/p1/reviews/r1/threads/t0/comments/c2'), { authorId: 'ana', kind: 'comment', body: 'x' }))],
  ['editor resolve thread para a próxima versão', () =>
    assertSucceeds(updateDoc(doc(as('bia'), 'projects/p1/reviews/r1/threads/t0'), {
      status: 'resolved',
      resolution: { kind: 'fixed_next_version', by: 'bia', at: serverTimestamp(), fixedInSnapshotId: null },
      updatedAt: serverTimestamp(),
    }))],
  ['editor carimba a versão em que a correção entrou', () =>
    assertSucceeds(updateDoc(doc(as('bia'), 'projects/p1/reviews/r1/threads/t9'), { 'resolution.fixedInSnapshotId': 's2', updatedAt: serverTimestamp() }))],
  ['viewer não carimba versão', () =>
    assertFails(updateDoc(doc(as('caio'), 'projects/p1/reviews/r1/threads/t9'), { 'resolution.fixedInSnapshotId': 's2', updatedAt: serverTimestamp() }))],
  ['revisor aprova a revisão', () =>
    assertSucceeds(updateDoc(doc(rev(), 'projects/p1/reviews/r1'), { status: 'approved', reviewerUid: 'rev', lastActivityAt: serverTimestamp() }))],
  ['revisor lista "minhas revisões" pelo e-mail (collectionGroup)', () =>
    assertSucceeds(getDocs(query(collectionGroup(rev(), 'reviews'), where('reviewerEmail', '==', 'rev@uni.br'))))],
  ['dono lê e grava a própria configuração de IA', () =>
    assertSucceeds(setDoc(doc(as('ana'), 'users/ana/private/ai'), { models: [{ provider: 'gemini', model: null, apiKey: 'k' }] }))],
  ['ninguém mais lê a configuração de IA (chaves)', () => assertFails(getDoc(doc(as('bia'), 'users/ana/private/ai')))],
  ['editor grava o cache de diff', () =>
    assertSucceeds(setDoc(doc(as('bia'), 'projects/p1/diffs/d2'), { targetSnapshotId: 's2', baseSnapshotId: 's1', createdBy: 'bia' }))],
  ['revisor não grava cache de diff', () =>
    assertFails(setDoc(doc(rev(), 'projects/p1/diffs/d3'), { targetSnapshotId: 's1', baseSnapshotId: 's0', createdBy: 'rev' }))],
  ['revisor lê o diff da versão concedida', () => assertSucceeds(getDoc(doc(rev(), 'projects/p1/diffs/d1')))],
  ['revisor notifica a autora pela revisão', () =>
    assertSucceeds(setDoc(doc(rev(), 'users/ana/notifications/n1'), {
      type: 'comment_added', projectId: 'p1', reviewId: 'r1', threadId: 't0', actorId: 'rev', title: 't', body: 'b', read: false,
    }))],
  ['estranho não cria notificação', () =>
    assertFails(setDoc(doc(as('zed'), 'users/ana/notifications/n2'), {
      type: 'comment_added', projectId: 'p1', reviewId: null, threadId: null, actorId: 'zed', title: 't', body: 'b', read: false,
    }))],
  ['criadora grava mensagem na própria conversa de IA', () =>
    assertSucceeds(setDoc(doc(as('bia'), 'projects/p1/aiConversations/c1/messages/m1'), { role: 'user', content: 'oi' }))],
  ['outro membro não lê conversa alheia', () =>
    assertFails(getDoc(doc(as('ana'), 'projects/p1/aiConversations/c1/messages/m1')))],
]);

await env.cleanup();
