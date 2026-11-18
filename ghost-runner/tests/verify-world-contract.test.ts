// Feature: ghost-runner, task 14.8 [no-docker]: compile-time World contract assertion.
// Validates: Requirements 2.1, 2.9, 17.9
import { expect, it } from 'vitest';
import type { World } from '@ghost-run/core';
import type { RepoState, RepoWorld, ShellAction } from '../src/index.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

// repoWorld is assignable to World<RepoState, ShellAction> (Req 2.1).
export type RepoWorldIsWorld = Assert<RepoWorld extends World<RepoState, ShellAction> ? true : false>;
// metadata.deterministic is exactly the literal false, and id is 'repo' (Req 2.9).
export type DeterministicIsFalse = Assert<Equal<RepoWorld['metadata']['deterministic'], false>>;
export type IdIsRepo = Assert<Equal<RepoWorld['metadata']['id'], 'repo'>>;

it('repoWorld satisfies the World<RepoState, ShellAction> contract at compile time', () => {
  const witness: { readonly deterministic: false } = {} as RepoWorld['metadata'];
  expect(witness).toBeDefined();
});
