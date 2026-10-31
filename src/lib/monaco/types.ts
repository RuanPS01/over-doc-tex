import type * as monacoApi from 'monaco-editor';

/**
 * O tipo `Monaco` exportado por @monaco-editor/react aponta para um subcaminho
 * que o `exports` do pacote monaco-editor não expõe, e vira `any`. Este alias
 * tipa a API a partir da entrada pública do pacote.
 */
export type MonacoApi = typeof monacoApi;
