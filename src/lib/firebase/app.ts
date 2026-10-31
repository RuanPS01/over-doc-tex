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
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Sem configuração, o app roda em modo demonstração (arquivos de exemplo, nada é salvo). */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let services: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices {
  if (services) return services;
  if (!isFirebaseConfigured) {
    throw new Error('Firebase não configurado: copie .env.example para .env e preencha as chaves.');
  }

  const app = initializeApp(config);
  const auth = getAuth(app);
  // Cache persistente: o PWA continua mostrando projetos e comentários offline.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const storage = getStorage(app);

  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }

  services = { app, auth, db, storage };
  return services;
}
