import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(import.meta.dirname, 'auth.service.ts'), 'utf8');

test('Firebase runtime SDK uses dynamic imports instead of entering the initial AuthService chunk', () => {
  assert.doesNotMatch(source, /^import\s+(?:\{|\*)[^;]+from ['"]@firebase\/(?:app|auth)['"]/m);
  assert.match(source, /import type \{ FirebaseApp \} from '@firebase\/app'/);
  assert.match(source, /import type \{ Auth, User \} from '@firebase\/auth'/);
  assert.match(source, /import\('@firebase\/app'\)/);
  assert.match(source, /import\('@firebase\/auth'\)/);
});

test('Firebase SDK loads only after runtime configuration validates and failed chunk loads can retry', () => {
  const initializeStart = source.indexOf('async initialize(): Promise<void>');
  const initializeEnd = source.indexOf('async currentUser()', initializeStart);
  const initialize = source.slice(initializeStart, initializeEnd);
  assert.ok(initialize.indexOf('await this.getRuntimeConfig()') < initialize.indexOf('await this.loadFirebaseModules()'));
  assert.match(source, /this\.firebaseModulesPromise = undefined/);
});
