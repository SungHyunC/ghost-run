import type { World } from '@ghost-run/core';
import type { PlaygroundAction, PlaygroundState, PlaygroundWorld } from '../src/index.js';

declare const playgroundWorld: PlaygroundWorld;

export const w: World<PlaygroundState, PlaygroundAction> = playgroundWorld;
