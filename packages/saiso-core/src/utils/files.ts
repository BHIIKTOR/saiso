import { promises as fs, type Stats } from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

/**
 * File System Utilities
 */

/**
 * Check if a file or directory exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists, create if it doesn't
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create directory: ${dirPath}`, error);
    throw error;
  }
}

/**
 * Copy file from source to destination
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  try {
    // Ensure destination directory exists
    await ensureDir(path.dirname(dest));
    await fs.copyFile(src, dest);
    logger.debug(`Copied file: ${src} -> ${dest}`);
  } catch (error) {
    logger.error(`Failed to copy file: ${src} -> ${dest}`, error);
    throw error;
  }
}

/**
 * Copy directory recursively
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  try {
    await ensureDir(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
    logger.debug(`Copied directory: ${src} -> ${dest}`);
  } catch (error) {
    logger.error(`Failed to copy directory: ${src} -> ${dest}`, error);
    throw error;
  }
}

/**
 * Read JSON file and parse it
 */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    logger.error(`Failed to read JSON file: ${filePath}`, error);
    throw error;
  }
}

/**
 * Write object to JSON file
 */
export async function writeJson(filePath: string, data: unknown, indent = 2): Promise<void> {
  try {
    await ensureDir(path.dirname(filePath));
    const content = JSON.stringify(data, null, indent);
    await fs.writeFile(filePath, content, 'utf-8');
    logger.debug(`Wrote JSON file: ${filePath}`);
  } catch (error) {
    logger.error(`Failed to write JSON file: ${filePath}`, error);
    throw error;
  }
}

/**
 * Find project root by looking for specific files
 */
export async function findProjectRoot(
  startDir = process.cwd(),
  markers = ['package.json', '.saiso']
): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    for (const marker of markers) {
      const markerPath = path.join(currentDir, marker);
      if (await exists(markerPath)) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Check if directory is a SAISO project
 */
export async function isSaisoProject(projectPath: string): Promise<boolean> {
  const saisoConfigPath = path.join(projectPath, '.saiso', 'config.json');
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (!(await exists(saisoConfigPath)) || !(await exists(packageJsonPath))) {
    return false;
  }

  try {
    const packageJson = await readJson<{ dependencies?: Record<string, string> }>(packageJsonPath);
    return !!(packageJson.dependencies?.['@saiso/core'] || packageJson.dependencies?.['@elizaos/core']);
  } catch {
    return false;
  }
}

/**
 * Get relative path from one directory to another
 */
export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Resolve path relative to project root
 */
export async function resolveProjectPath(relativePath: string, projectRoot?: string): Promise<string> {
  const root = projectRoot || await findProjectRoot();
  if (!root) {
    throw new Error('Could not find project root');
  }
  return path.resolve(root, relativePath);
}

/**
 * Create a backup of a file
 */
export async function backupFile(filePath: string): Promise<string> {
  if (!(await exists(filePath))) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup.${timestamp}`;

  await copyFile(filePath, backupPath);
  logger.debug(`Created backup: ${filePath} -> ${backupPath}`);

  return backupPath;
}

/**
 * Clean up old backup files
 */
export async function cleanupBackups(filePath: string, keepCount = 5): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);
    const entries = await fs.readdir(dir);

    const backups = entries
      .filter(entry => entry.startsWith(`${basename}.backup.`))
      .map(entry => ({
        name: entry,
        path: path.join(dir, entry),
        stat: undefined as Stats | undefined,
      }));

    // Get file stats for sorting by creation time
    for (const backup of backups) {
      backup.stat = await fs.stat(backup.path);
    }

    // Sort by creation time (newest first)
    backups.sort((a, b) => {
      if (!a.stat || !b.stat) return 0;
      return b.stat.birthtime.getTime() - a.stat.birthtime.getTime();
    });

    // Remove old backups
    const toDelete = backups.slice(keepCount);
    for (const backup of toDelete) {
      await fs.unlink(backup.path);
      logger.debug(`Removed old backup: ${backup.path}`);
    }
  } catch (error) {
    logger.warn(`Failed to cleanup backups for ${filePath}:`, error);
  }
}
