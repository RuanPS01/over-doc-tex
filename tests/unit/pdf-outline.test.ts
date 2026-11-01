import { describe, expect, it } from 'vitest';
import { activeOutlineId, ancestorIds, destinationTop, flattenOutline, type PdfOutlineItem } from '@/lib/pdf/outline';

const A4 = [0, 0, 595.28, 841.89];

const item = (id: string, page: number | null, y: number | null, children: PdfOutlineItem[] = []): PdfOutlineItem => ({ id, title: `Seção ${id}`, page, y, children });

// Capítulo 1 (pág. 3) com 1.1 (pág. 3, mais abaixo) e 1.2 (pág. 5); capítulo 2 (pág. 8); referências sem destino.
const OUTLINE = [item('0', 3, 0.1, [item('0.0', 3, 0.4), item('0.1', 5, 0.2, [item('0.1.0', 6, 0.5)])]), item('1', 8, 0.1), item('2', null, null)];

describe('índice do PDF', () => {
  it('converte a altura do destino (medida de baixo no PDF) em fração a partir do topo', () => {
    expect(destinationTop('XYZ', [72, 841.89, null], A4)).toBe(0);
    expect(destinationTop('XYZ', [72, 420.945, 0], A4)).toBeCloseTo(0.5);
    expect(destinationTop('FitH', [210.47], A4)).toBeCloseTo(0.75);
    expect(destinationTop('FitR', [0, 0, 100, 841.89], A4)).toBe(0);
    expect(destinationTop('XYZ', [72, 2000, 0], A4)).toBe(0);
    expect(destinationTop('Fit', [], A4)).toBeNull();
    expect(destinationTop('XYZ', [72, null, 0], A4)).toBeNull();
    expect(destinationTop('XYZ', [72, 400, 0], [0, 0, 0, 0])).toBeNull();
  });

  it('lista os itens com destino na ordem do índice e guarda o pai de cada um', () => {
    const { entries, parents } = flattenOutline(OUTLINE);
    expect(entries.map((entry) => entry.id)).toEqual(['0', '0.0', '0.1', '0.1.0', '1']);
    expect(parents.get('0.1.0')).toBe('0.1');
    expect(parents.get('2')).toBeNull();
    expect(ancestorIds('0.1.0', parents)).toEqual(['0.1', '0']);
    expect(ancestorIds('1', parents)).toEqual([]);
  });

  it('a seção atual é a última que começa antes do ponto lido na tela', () => {
    const { entries } = flattenOutline(OUTLINE);
    expect(activeOutlineId(entries, { page: 1, y: 0.5 })).toBeNull();
    expect(activeOutlineId(entries, { page: 3, y: 0.2 })).toBe('0');
    expect(activeOutlineId(entries, { page: 3, y: 0.4 })).toBe('0.0');
    expect(activeOutlineId(entries, { page: 4, y: 0.9 })).toBe('0.0');
    expect(activeOutlineId(entries, { page: 6, y: 0.6 })).toBe('0.1.0');
    expect(activeOutlineId(entries, { page: 20, y: 0 })).toBe('1');
  });

  it('capítulo e primeira seção no mesmo ponto: vale a seção (vem depois no índice)', () => {
    const { entries } = flattenOutline([item('0', 2, 0.1, [item('0.0', 2, 0.1)])]);
    expect(activeOutlineId(entries, { page: 2, y: 0.3 })).toBe('0.0');
  });
});
