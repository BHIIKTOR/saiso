import { mkdir } from 'node:fs/promises';
import type { SaisoPluginModule } from '@saiso/plugin-sdk';
import { registerHereticCommands, pluginDoctor } from './commands.js';

const pluginModule: SaisoPluginModule = {
  async init(context) {
    await mkdir(context.fs.resolveProjectPath('.saiso/heretic'), { recursive: true });
  },

  registerCommands(program, context) {
    registerHereticCommands(program, context);
  },

  async doctor(context) {
    return pluginDoctor(context);
  },
};

export default pluginModule;
