// The repository registers its own server for Kiro in .kiro/settings/mcp.json, shipped disabled.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const file = resolve(root, '.kiro', 'settings', 'mcp.json');

describe('.kiro/settings/mcp.json', () => {
  it('parses, names the ghost-run server, ships it disabled, and points at the server entry', () => {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    expect(Object.keys(doc.mcpServers)).toEqual(['ghost-run']);
    const server = doc.mcpServers['ghost-run'];
    expect(server.disabled).toBe(true);
    expect(server.command).toBe('node');
    expect(server.args).toHaveLength(1);
    const entry = resolve(root, server.args[0]);
    expect(entry.startsWith(resolve(root, 'integrations', 'mcp') + '/')).toBe(true);
    expect(existsSync(entry)).toBe(true);
    const pkg = JSON.parse(readFileSync(resolve(root, 'integrations', 'mcp', 'package.json'), 'utf8'));
    expect(entry).toBe(resolve(root, 'integrations', 'mcp', pkg.bin['ghost-run-mcp']));
  });

  it('uses only keys Kiro reads and no secret or absolute path', () => {
    const text = readFileSync(file, 'utf8');
    const server = JSON.parse(text).mcpServers['ghost-run'];
    expect(Object.keys(server).sort()).toEqual(['args', 'command', 'disabled', 'env']);
    expect(server.env).toEqual({});
    expect(text).not.toMatch(/\/(Users|home)\//);
  });
});
