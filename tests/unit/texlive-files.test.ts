import { describe, expect, it } from 'vitest';
import { looksLikeHtmlPage } from '@/lib/latex/texlive-files';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('resposta de SPA no repositório de pacotes', () => {
  it('reconhece o index.html que a hospedagem devolve no lugar de um pacote que não existe', () => {
    expect(looksLikeHtmlPage(bytes('<!doctype html>\n<html lang="pt-BR">'))).toBe(true);
    expect(looksLikeHtmlPage(bytes('\uFEFF  \n<!DOCTYPE html><html>'))).toBe(true);
    expect(looksLikeHtmlPage(bytes('<html><head>'))).toBe(true);
  });

  it('deixa passar arquivos de verdade, mesmo que o Firebase os sirva como text/html', () => {
    expect(looksLikeHtmlPage(bytes('\\ProvidesFile{numeric.bbx}[2024/03/21 v3.20 biblatex bibliography style]'))).toBe(false);
    expect(looksLikeHtmlPage(bytes('%% This is file `brazil.ldf\''))).toBe(false);
    expect(looksLikeHtmlPage(new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]))).toBe(false);
  });
});
