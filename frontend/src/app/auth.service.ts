import { Injectable } from '@angular/core';
import { getApp, getApps, initializeApp } from '@firebase/app';
import type { FirebaseApp } from '@firebase/app';
import {
  createUserWithEmailAndPassword, getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, signOut
} from '@firebase/auth';
import type { Auth, User } from '@firebase/auth';
import { AuthStateBroadcaster, observeAuthState } from './auth-state-observer';
import { validateRuntimeConfig, type RuntimeConfig } from './runtime-config';
export type { RuntimeConfig } from './runtime-config';

export interface AuthUserSnapshot { uid: string; email: string | null; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private configPromise?: Promise<RuntimeConfig>;
  private auth: Auth | null = null;
  private authReady?: Promise<void>;
  private authStateUnsubscribe?: () => void;
  private user: User | null = null;
  private authStateKnown = false;
  private readonly authState = new AuthStateBroadcaster<AuthUserSnapshot>();

  getRuntimeConfig(): Promise<RuntimeConfig> {
    if (!this.configPromise) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      this.configPromise = fetch('/runtime-config.json', { cache: 'no-store', signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Runtime configuration could not be loaded.');
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            throw new Error('Runtime configuration is invalid.');
          }
          return validateRuntimeConfig(payload);
        })
        .catch(error => {
          this.configPromise = undefined;
          if ((error as { name?: string } | null)?.name === 'AbortError') {
            throw new Error('Runtime configuration request timed out. Check your connection and retry.');
          }
          throw error;
        })
        .finally(() => clearTimeout(timeoutId));
    }
    return this.configPromise;
  }

  async isConfigured(): Promise<boolean> {
    try {
      const config = await this.getRuntimeConfig();
      return Boolean(
        config.firebase?.apiKey &&
        config.firebase?.authDomain &&
        config.firebase?.projectId &&
        config.firebase?.appId
      );
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    const config = await this.getRuntimeConfig();
    if (!config.firebase?.apiKey || !config.firebase?.authDomain ||
        !config.firebase?.projectId || !config.firebase?.appId) {
      throw new Error('Firebase web-app settings are missing in runtime-config.json.');
    }
    if (!this.auth) {
      const appName = 'aba-web';
      const app: FirebaseApp = getApps().some(item => item.name === appName)
        ? getApp(appName)
        : initializeApp(config.firebase, appName);
      this.auth = getAuth(app);
    }
    // Keep the Firebase observer alive so cross-tab sign-in/sign-out changes
    // update the cached user after the initial session check.
    if (!this.authReady) {
      this.authReady = observeAuthState<User>(
        (onUser, onError) => onAuthStateChanged(this.auth!, onUser, onError),
        user => { this.updateUser(user ?? null); },
        _error => {
          this.updateUser(null);
          this.authStateUnsubscribe = undefined;
          this.authReady = undefined;
        },
        unsubscribe => { this.authStateUnsubscribe = unsubscribe; }
      );
    }
    try {
      await this.authReady;
    } catch (error) {
      this.updateUser(null);
      this.authReady = undefined;
      this.authStateUnsubscribe?.();
      this.authStateUnsubscribe = undefined;
      throw error;
    }
  }

  async currentUser(): Promise<User | null> {
    await this.initialize();
    return this.user;
  }

  async signIn(email: string, password: string): Promise<User> {
    await this.initialize();
    const credential = await signInWithEmailAndPassword(this.auth!, email.trim(), password);
    this.updateUser(credential.user);
    return credential.user;
  }

  async signUp(email: string, password: string): Promise<User> {
    await this.initialize();
    const credential = await createUserWithEmailAndPassword(this.auth!, email.trim(), password);
    this.updateUser(credential.user);
    return credential.user;
  }

  async idToken(): Promise<string> {
    await this.initialize();
    if (!this.user) throw new Error('Sign in before accessing business data.');
    return await this.user.getIdToken();
  }

  async signOut(): Promise<void> {
    await this.initialize();
    await signOut(this.auth!);
    this.updateUser(null);
  }

  subscribeToAuthState(listener: (user: AuthUserSnapshot | null) => void): () => void {
    return this.authState.subscribe(listener);
  }

  private updateUser(user: User | null): void {
    const changed = !this.authStateKnown ||
      this.user?.uid !== user?.uid ||
      (this.user?.email ?? null) !== (user?.email ?? null);
    this.user = user;
    this.authStateKnown = true;
    if (changed) {
      this.authState.publish(user ? { uid: user.uid, email: user.email } : null);
    }
  }
}
