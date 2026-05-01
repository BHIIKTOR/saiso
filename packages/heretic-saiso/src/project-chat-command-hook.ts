import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface ProjectChatCommandHookInput {
  projectRoot: string;
  workspaceRoot: string;
  mode: 'relay' | 'ingest';
  message: string;
  transport?: string;
  transportIdentity?: string;
  channelId?: string;
  threadId?: string;
  correlationKey?: string;
}

export interface ProjectChatCommandHookResult {
  handled: boolean;
  responseText?: string;
  data?: Record<string, unknown>;
}

type ProjectChatCommandHook = (input: ProjectChatCommandHookInput) => Promise<ProjectChatCommandHookResult | null | undefined>;

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveProjectChatCommandHook(projectRoot: string): Promise<ProjectChatCommandHook | null> {
  const candidates = [
    path.join(projectRoot, '.heretic', 'transport-command-hook.mjs'),
    path.join(projectRoot, 'src', 'chat-commands', 'transportHook.ts'),
    path.join(projectRoot, 'src', 'chat-commands', 'transportHook.js'),
    path.join(projectRoot, 'dist', 'chat-commands', 'transportHook.js'),
  ];

  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) {
      continue;
    }

    const loaded = await import(pathToFileURL(candidate).href);
    const handler = typeof loaded.default === 'function'
      ? loaded.default
      : typeof loaded.handleTransportCommand === 'function'
        ? loaded.handleTransportCommand
        : null;
    if (handler) {
      return handler as ProjectChatCommandHook;
    }
  }

  return null;
}

export async function runProjectChatCommandHook(
  input: ProjectChatCommandHookInput,
): Promise<ProjectChatCommandHookResult | null> {
  const handler = await resolveProjectChatCommandHook(input.projectRoot);
  if (!handler) {
    return null;
  }

  const result = await handler(input);
  if (!result) {
    return null;
  }

  return {
    handled: result.handled === true,
    ...(typeof result.responseText === 'string' ? { responseText: result.responseText } : {}),
    ...(result.data && typeof result.data === 'object' && !Array.isArray(result.data)
      ? { data: result.data }
      : {}),
  };
}
