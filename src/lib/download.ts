/** Entrega bytes gerados no navegador como download de arquivo. */
export function downloadBytes(bytes: Uint8Array, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // O navegador precisa do endereço até iniciar o download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Revisão Colaborativa" vira "revisao-colaborativa". */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'projeto'
  );
}
