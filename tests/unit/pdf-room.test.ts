import { describe, expect, it } from 'vitest';
import { buildPdfRoom, buildPdfSnapshot, formatBytes, isPdfData, roomNameFromFile } from '@/features/pdf-rooms/model/pdf-room';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('sala de revisão de PDF avulso', () => {
  it('reconhece o PDF pela assinatura, mesmo com bytes antes dela', () => {
    expect(isPdfData(bytes('%PDF-1.7\n%...'))).toBe(true);
    expect(isPdfData(bytes('﻿lixo antes %PDF-1.4'))).toBe(true);
    expect(isPdfData(bytes('PK\u0003\u0004 um zip'))).toBe(false);
    expect(isPdfData(new Uint8Array())).toBe(false);
  });

  it('sugere o nome da sala a partir do arquivo', () => {
    expect(roomNameFromFile('Relatorio_final.pdf')).toBe('Relatorio final');
    expect(roomNameFromFile('artigo.PDF')).toBe('artigo');
    expect(roomNameFromFile('.pdf')).toBe('');
  });

  it('mostra o tamanho em KB ou MB', () => {
    expect(formatBytes(2048, 'pt-BR')).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024 + 512 * 1024, 'pt-BR')).toBe('5,5 MB');
  });

  it('cria o projeto com kind "pdf", só o dono e contadores zerados (regra de criação)', () => {
    const room = buildPdfRoom({ uid: 'ana', profile: { name: 'Ana', email: 'ana@uni.br' }, name: 'Artigo', now: 'agora' });
    expect(room).toMatchObject({
      name: 'Artigo',
      kind: 'pdf',
      ownerId: 'ana',
      members: { ana: 'owner' },
      memberIds: ['ana'],
      pendingMembers: {},
      counters: { snapshots: 0, reviews: 0 },
      latestSnapshotId: null,
      mainDocumentId: 'main',
    });
  });

  it('a versão tem só o documento "main", sem manifesto nem SyncTeX', () => {
    const snapshot = buildPdfSnapshot({
      uid: 'ana',
      fileName: 'artigo.pdf',
      version: { major: 1, minor: 2 },
      sequence: 3,
      parentSnapshotId: 's2',
      message: '  Rodada final ',
      pdfSha256: 'f'.repeat(64),
      pdfPath: 'p/files/main.pdf',
      pageTextPath: 'p/files/main.pages',
      pages: ['Uma frase curta.', 'Mais duas palavras'],
      now: 'agora',
    });
    expect(snapshot.label).toBe('1.2');
    expect(snapshot.files).toEqual([]);
    expect(snapshot.sourceHash).toBe('f'.repeat(64));
    expect(snapshot.message).toBe('Rodada final');
    expect(snapshot.stats).toEqual({ words: 6, pages: 2 });
    expect(Object.keys(snapshot.documents)).toEqual(['main']);
    expect(snapshot.documents.main).toMatchObject({ title: 'artigo.pdf', role: 'main', pageCount: 2, synctexPath: null, pageTextPath: 'p/files/main.pages' });
  });
});
