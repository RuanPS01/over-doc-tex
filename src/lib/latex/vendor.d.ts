/** A xzwasm não publica tipos; o Siglum só precisa do construtor exportado. */
declare module 'xzwasm' {
  export const XzReadableStream: new (stream: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>;
  const xzwasm: { XzReadableStream: typeof XzReadableStream };
  export default xzwasm;
}

/** Worker do Siglum servido como arquivo estático (alias em vite.config.ts). */
declare module 'siglum-worker?url' {
  const url: string;
  export default url;
}
