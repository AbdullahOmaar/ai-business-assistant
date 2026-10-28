import { Injectable } from '@angular/core';
import { getApp, getApps, initializeApp } from '@firebase/app';
import type { FirebaseApp } from '@firebase/app';
import {
  createUserWithEmailAndPassword, getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, signOut
} from '@firebase/auth';
import type { Auth, User } from '@firebase/auth';

export interface RuntimeConfig {
  apiBaseUrl: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private configPromise?: Promise<RuntimeConfig>;
  private auth: Auth | null = null;
  private authReady?: Promise<void>;
  private user: User | null = null;

  getRuntimeConfig(): Promise<RuntimeConfig> {
    if (!this.configPromise) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      this.configPromise = fetch('/runtime-config.json', { cache: 'no-store', signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Runtime configuration could not be loaded.');
          return await response.json() as RuntimeConfig;
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
    // Re-create the observer after a timeout/error so the Retry button is effective.
    if (!this.authReady) {
      this.authReady = new Promise<void>((resolve, reject) => {
        let unsubscribe: () => void = () => {};
        let settled = false;
        const timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          unsubscribe();
          this.authReady = undefined;
          reject(new Error('Firebase sign-in session check timed out. Retry when your connection is stable.'));
        }, 10_000);
        const finish = (error?: unknown, user?: User | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          unsubscribe();
          if (error) {
            this.authReady = undefined;
            reject(error);
            return;
          }
          this.user = user ?? null;
          resolve();
        };
        unsubscribe = onAuthStateChanged(
          this.auth!,
          user => finish(undefined, user),
          error => finish(error)
        );
      });
    }
    try {
      await this.authReady;
    } catch (error) {
      this.authReady = undefined;
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
    this.user = credential.user;
    return credential.user;
  }

  async signUp(email: string, password: string): Promise<User> {
    await this.initialize();
    const credential = await createUserWithEmailAndPassword(this.auth!, email.trim(), password);
    this.user = credential.user;
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
    this.user = null;
  }
}
