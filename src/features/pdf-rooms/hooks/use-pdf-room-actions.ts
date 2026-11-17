import { collection, doc, getDocs, serverTimestamp, writeBatch, type DocumentReference, type Firestore } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import { getFirebase } from '@/lib/firebase/app';

/** Lote com teto de operações: grava e recomeça antes de passar do limite do Firestore (500). */
class BatchWriter {
  private batch;
  private count = 0;

  constructor(
    private readonly db: Firestore,
    private readonly limit = 450,
  ) {
    this.batch = writeBatch(db);
  }

  /** Apaga um grupo de documentos que precisa ir no mesmo lote (a thread e os comentários dela). */
  async deleteTogether(refs: readonly DocumentReference[]): Promise<void> {
    if (this.count > 0 && this.count + refs.length > this.limit) await this.flush();
    for (const ref of refs) this.batch.delete(ref);
    this.count += refs.length;
  }

  async delete(ref: DocumentReference): Promise<void> {
    await this.deleteTogether([ref]);
  }

  async flush(): Promise<void> {
    if (this.count === 0) return;
    await this.batch.commit();
    this.batch = writeBatch(this.db);
    this.count = 0;
  }
}

const refsOf = async (db: Firestore, path: string) => (await getDocs(collection(db, path))).docs.map((item) => item.ref);

/**
 * Renomear e excluir uma sala de revisão de PDF avulso. Excluir apaga de baixo
 * para cima, como as regras exigem: comentários junto com a thread, links e
 * rodadas, concessões, fichas de visitante, pedaços e arquivos de cada versão,
 * as versões e, por último, o projeto (as regras dos filhos leem o projeto).
 */
export function usePdfRoomActions() {
  /** Novo nome: o projeto e o nome denormalizado nas rodadas, num lote só. */
  const rename = useCallback(async (roomId: string, name: string) => {
    const { db } = getFirebase();
    const batch = writeBatch(db);
    batch.update(doc(db, firestorePaths.project(roomId)), { name, updatedAt: serverTimestamp() });
    for (const review of await refsOf(db, firestorePaths.reviews(roomId))) batch.update(review, { projectName: name });
    await batch.commit();
  }, []);

  const remove = useCallback(async (roomId: string) => {
    const { db } = getFirebase();
    const writer = new BatchWriter(db);

    for (const review of await refsOf(db, firestorePaths.reviews(roomId))) {
      for (const thread of await refsOf(db, firestorePaths.threads(roomId, review.id))) {
        const comments = await refsOf(db, firestorePaths.comments(roomId, review.id, thread.id));
        await writer.deleteTogether([...comments, thread]);
      }
      for (const link of await refsOf(db, firestorePaths.reviewLinks(roomId, review.id))) await writer.delete(link);
      await writer.delete(review);
    }

    for (const snapshot of await refsOf(db, firestorePaths.snapshots(roomId))) {
      const children = [firestorePaths.snapshotGrants(roomId, snapshot.id), firestorePaths.snapshotGuests(roomId, snapshot.id)];
      for (const path of children) {
        for (const ref of await refsOf(db, path)) await writer.delete(ref);
      }
      for (const file of await refsOf(db, firestorePaths.snapshotFiles(roomId, snapshot.id))) {
        for (const chunk of await refsOf(db, firestorePaths.chunks(file.path))) await writer.delete(chunk);
        await writer.delete(file);
      }
      await writer.delete(snapshot);
    }
    await writer.flush();

    const batch = writeBatch(db);
    batch.delete(doc(db, firestorePaths.project(roomId)));
    await batch.commit();
  }, []);

  return { rename, remove };
}
