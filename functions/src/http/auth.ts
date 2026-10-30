import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { Request } from 'express';
import type { ProjectDoc, ProjectRole } from '@shared/firestore/types';
import { firestorePaths } from '@shared/firestore/paths';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'unauthenticated' | 'forbidden' | 'invalid_request',
    message: string,
  ) {
    super(message);
  }
}

/** Valida o ID token do Firebase enviado em `Authorization: Bearer <token>`. */
export async function authenticate(req: Request): Promise<{ uid: string; email: string | null }> {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match?.[1]) {
    throw new HttpError(401, 'unauthenticated', 'Token de acesso ausente.');
  }
  try {
    const decoded = await getAuth().verifyIdToken(match[1], true);
    return { uid: decoded.uid, email: decoded.email?.toLowerCase() ?? null };
  } catch {
    throw new HttpError(401, 'unauthenticated', 'Sessão inválida ou expirada.');
  }
}

/** Garante que o usuário é membro do projeto com um dos papéis aceitos. */
export async function requireProjectRole(
  projectId: string,
  uid: string,
  accepted: readonly ProjectRole[],
): Promise<ProjectDoc> {
  const snap = await getFirestore().doc(firestorePaths.project(projectId)).get();
  const project = snap.data() as ProjectDoc | undefined;
  const role = project?.members[uid];
  if (!project || !role || !accepted.includes(role)) {
    throw new HttpError(403, 'forbidden', 'Sem permissão para este projeto.');
  }
  return project;
}
