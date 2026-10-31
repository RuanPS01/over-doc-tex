import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  Bytes,
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

// Arquivos em pedaços: mesmos valores de src/lib/stored-files/chunks.ts.
const CHUNK = 1_000_000;
const sha = (char) => char.repeat(64);
const zeros = (size) => Bytes.fromUint8Array(new Uint8Array(size));
const fileInfo = (totalBytes, overrides = {}) => ({
  totalBytes,
  contentType: 'application/pdf',
  sha256: sha('a'),
  chunkCount: Math.ceil(totalBytes / CHUNK),
  chunkBytes: CHUNK,
  ...overrides,
});

/**
 * Grava pedaços e cabeçalho num lote só, como src/lib/firebase/stored-files.ts
 * faz no último lote. `chunks` escolhe quais índices enviar (padrão: todos).
 */
function storeFile(db, headerPath, uid, totalBytes, { info = {}, chunks, header } = {}) {
  const full = fileInfo(totalBytes, info);
  const batch = writeBatch(db);
  const indexes = chunks ?? [...Array(full.chunkCount).keys()];
  for (const index of indexes) {
    // Pelo menos 1 byte: os cenários de cabeçalho incoerente pedem pedaços além do conteúdo.
    batch.set(doc(db, `${headerPath}/chunks/${index}`), { data: zeros(Math.max(1, Math.min(CHUNK, totalBytes - index * CHUNK))) });
  }
  batch.set(doc(db, headerPath), header ?? { ...full, createdBy: uid, createdAt: serverTimestamp() });
  return batch.commit();
}

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
  await setDoc(doc(db, 'projects/p1/diffs/d1'), {
    targetSnapshotId: 's1', baseSnapshotId: 's0', documentId: 'main', createdBy: 'bia', pdf: fileInfo(10),
  });
  await setDoc(doc(db, 'projects/p1/diffs/d1/chunks/0'), { data: zeros(10) });
  // Blob finalizado e arquivos da versão s1 (principal e secundário).
  for (const path of [`projects/p1/blobs/${sha('a')}`, 'projects/p1/snapshots/s1/files/main.pdf', 'projects/p1/snapshots/s1/files/apendice.pdf']) {
    await setDoc(doc(db, path), { ...fileInfo(10), createdBy: 'bia', createdAt: 1 });
    await setDoc(doc(db, `${path}/chunks/0`), { data: zeros(10) });
  }
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
  // ------------------------------------------------- arquivos em pedaços: blobs
  ['editor grava blob em pedaços com o cabeçalho no último lote', () =>
    assertSucceeds(storeFile(as('bia'), `projects/p1/blobs/${sha('c')}`, 'bia', CHUNK + 10, { info: { sha256: sha('c') } }))],
  ['cabeçalho sem o último pedaço é negado', () =>
    assertFails(storeFile(as('bia'), `projects/p1/blobs/${sha('d')}`, 'bia', CHUNK + 10, { info: { sha256: sha('d') }, chunks: [0] }))],
  ['cabeçalho com sha256 diferente do id é negado', () =>
    assertFails(storeFile(as('bia'), `projects/p1/blobs/${sha('e')}`, 'bia', 10, { info: { sha256: sha('f') } }))],
  ['cabeçalho com número de pedaços incoerente é negado', () =>
    assertFails(storeFile(as('bia'), `projects/p1/blobs/${sha('9')}`, 'bia', 10, { info: { sha256: sha('9'), chunkCount: 2 }, chunks: [0, 1] }))],
  ['blob acima de 25 MiB é negado', () =>
    assertFails(storeFile(as('bia'), `projects/p1/blobs/${sha('8')}`, 'bia', 26214401, { info: { sha256: sha('8') }, chunks: [26] }))],
  ['pedaço maior que 1.000.000 bytes é negado', () =>
    assertFails(setDoc(doc(as('bia'), `projects/p1/blobs/${sha('7')}/chunks/0`), { data: zeros(CHUNK + 1) }))],
  ['viewer não grava pedaço', () =>
    assertFails(setDoc(doc(as('caio'), `projects/p1/blobs/${sha('6')}/chunks/0`), { data: zeros(10) }))],
  ['pedaço pode ser reenviado antes do cabeçalho', async () => {
    const chunk = doc(as('bia'), `projects/p1/blobs/${sha('5')}/chunks/0`);
    await assertSucceeds(setDoc(chunk, { data: zeros(10) }));
    await assertSucceeds(setDoc(chunk, { data: zeros(20) }));
  }],
  ['blob finalizado não aceita pedaço novo nem mudança no cabeçalho', async () => {
    await assertFails(setDoc(doc(as('bia'), `projects/p1/blobs/${sha('a')}/chunks/0`), { data: zeros(10) }));
    await assertFails(updateDoc(doc(as('bia'), `projects/p1/blobs/${sha('a')}`), { contentType: 'text/plain' }));
  }],
  ['membro lê os pedaços do blob; estranho e revisor não', async () => {
    await assertSucceeds(getDocs(collection(as('caio'), `projects/p1/blobs/${sha('a')}/chunks`)));
    await assertFails(getDocs(collection(as('zeca'), `projects/p1/blobs/${sha('a')}/chunks`)));
    await assertFails(getDoc(doc(rev(), `projects/p1/blobs/${sha('a')}`)));
  }],

  // --------------------------------------- arquivos em pedaços: arquivos da versão
  ['editor grava PDF da versão antes de congelar', () =>
    assertSucceeds(storeFile(as('bia'), 'projects/p1/snapshots/s7/files/main.pdf', 'bia', CHUNK + 10))],
  ['versão congelada não recebe arquivo nem pedaço novo', async () => {
    await assertFails(storeFile(as('bia'), 'projects/p1/snapshots/s1/files/novo.pdf', 'bia', 10));
    await assertFails(setDoc(doc(as('bia'), 'projects/p1/snapshots/s1/files/outro.pdf/chunks/0'), { data: zeros(10) }));
  }],
  ['nome de arquivo de versão fora do padrão é negado', () =>
    assertFails(storeFile(as('bia'), 'projects/p1/snapshots/s7/files/main.exe', 'bia', 10))],
  ['revisor lê o PDF do documento concedido', async () => {
    await assertSucceeds(getDoc(doc(rev(), 'projects/p1/snapshots/s1/files/main.pdf')));
    await assertSucceeds(getDocs(collection(rev(), 'projects/p1/snapshots/s1/files/main.pdf/chunks')));
  }],
  ['revisor não lê documento secundário sem concessão', async () => {
    await assertFails(getDoc(doc(rev(), 'projects/p1/snapshots/s1/files/apendice.pdf')));
    await assertFails(getDocs(collection(rev(), 'projects/p1/snapshots/s1/files/apendice.pdf/chunks')));
  }],
  ['revisor com e-mail não verificado não lê arquivo da versão', () =>
    assertFails(getDoc(doc(as('rev', { email: 'rev@uni.br', email_verified: false }), 'projects/p1/snapshots/s1/files/main.pdf')))],

  // ---------------------------------------------- arquivos em pedaços: PDF do diff
  ['editor grava o diff com o PDF em pedaços', () =>
    assertSucceeds(storeFile(as('bia'), 'projects/p1/diffs/d3', 'bia', 10, {
      header: { targetSnapshotId: 's2', baseSnapshotId: 's1', documentId: 'main', createdBy: 'bia', pdf: fileInfo(10) },
    }))],
  ['diff com PDF sem os pedaços é negado', () =>
    assertFails(setDoc(doc(as('bia'), 'projects/p1/diffs/d4'), {
      targetSnapshotId: 's2', baseSnapshotId: 's1', documentId: 'main', createdBy: 'bia', pdf: fileInfo(10),
    }))],
  ['revisor lê o PDF do diff da versão concedida', () =>
    assertSucceeds(getDocs(collection(rev(), 'projects/p1/diffs/d1/chunks')))],
  ['diff gravado não aceita pedaço novo', () =>
    assertFails(setDoc(doc(as('bia'), 'projects/p1/diffs/d1/chunks/1'), { data: zeros(10) }))],
]);

await env.cleanup();
