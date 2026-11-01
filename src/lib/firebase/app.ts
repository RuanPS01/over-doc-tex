/**
 * Inicialização preguiçosa do Firebase. Componentes nunca importam deste
 * arquivo: o acesso passa pelos hooks em src/features/<domínio>/hooks.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getLocale, subscribeLocale, t } from '@/lib/i18n';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Sem configuração, o app roda em modo demonstração (arquivos de exemplo, nada é salvo). */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let services: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices {
  if (services) return services;
  if (!isFirebaseConfigured) {
    throw new Error(t('Firebase não configurado: copie .env.example para .env e preencha as chaves.'));
  }

  const app = initializeApp(config);
  const auth = getAuth(app);
  // E-mails do Firebase (link de acesso, convite de revisão, troca de senha) e a
  // página de troca de senha saem no idioma da interface, acompanhando a troca.
  auth.languageCode = getLocale();
  subscribeLocale(() => {
    auth.languageCode = getLocale();
  });
  // Cache persistente: o PWA continua mostrando projetos e comentários offline.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  services = { app, auth, db };
  return services;
}
