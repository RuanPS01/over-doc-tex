/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
  /** "true" copia o log do compilador LaTeX para o console (depuração). */
  readonly VITE_SIGLUM_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
