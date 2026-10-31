import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'demo';

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(user: User): AuthUser {
  return { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isFirebaseConfigured ? 'loading' : 'demo');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(getFirebase().auth, (current) => {
      setUser(current ? toAuthUser(current) : null);
      setStatus(current ? 'signed-in' : 'signed-out');
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signInWithGoogle: async () => {
        await signInWithPopup(getFirebase().auth, new GoogleAuthProvider());
      },
      signInWithEmail: async (email, password) => {
        await signInWithEmailAndPassword(getFirebase().auth, email, password);
      },
      signUpWithEmail: async (email, password) => {
        await createUserWithEmailAndPassword(getFirebase().auth, email, password);
      },
      signOut: () => firebaseSignOut(getFirebase().auth),
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
