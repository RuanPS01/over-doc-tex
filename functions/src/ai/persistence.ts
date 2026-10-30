import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { AiRequest } from '@shared/ai/schemas';
import { firestorePaths } from '@shared/firestore/paths';
import type { TaskOutcome } from './run-task';

/** Garante uma conversa para o pedido e devolve o seu id. */
export async function ensureConversation(request: AiRequest, uid: string): Promise<string> {
  const conversations = getFirestore().collection(firestorePaths.aiConversations(request.projectId));
  if (request.conversationId) {
    const existing = await conversations.doc(request.conversationId).get();
    if (existing.exists && existing.get('createdBy') === uid) return existing.id;
  }
  const created = await conversations.add({
    title: request.prompt.slice(0, 80),
    createdBy: uid,
    lastTask: request.task,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return created.id;
}

/** Grava a pergunta e a resposta ao fim do stream (melhor esforço). */
export async function saveExchange(input: {
  request: AiRequest;
  conversationId: string;
  outcome: TaskOutcome | null;
  status: 'complete' | 'error' | 'aborted';
}): Promise<void> {
  const { request, conversationId, outcome, status } = input;
  const db = getFirestore();
  const messages = db.collection(firestorePaths.aiMessages(request.projectId, conversationId));
  const batch = db.batch();

  batch.set(messages.doc(), {
    role: 'user',
    task: request.task,
    content: request.prompt,
    structured: null,
    contextRefs: [],
    usage: null,
    status: 'complete',
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(messages.doc(), {
    role: 'assistant',
    task: request.task,
    content: outcome?.text ?? '',
    structured: outcome?.structured ?? null,
    contextRefs: outcome?.contextRefs ?? [],
    usage: outcome?.usage ?? null,
    status,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.doc(firestorePaths.aiConversation(request.projectId, conversationId)), {
    lastTask: request.task,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}
