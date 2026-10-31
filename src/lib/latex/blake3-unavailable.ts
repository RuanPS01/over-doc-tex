/**
 * Substitui a blake3-wasm, que não empacota no Vite (falta um arquivo no
 * pacote publicado). Falhar ao carregar faz o Siglum usar o hash DJB2 dele,
 * que basta para o que ele faz: detectar mudanças no preâmbulo e no documento.
 * Ligado pelo alias em vite.config.ts.
 */
throw new Error('BLAKE3 indisponível: o Siglum usa o hash DJB2.');
