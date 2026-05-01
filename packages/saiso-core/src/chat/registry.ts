import { ChatTransportError } from './errors.js';
import type { ChatModeResolution, ChatResponseMode, ChatTransportAdapter } from './types.js';

export class ChatTransportRegistry {
  private readonly adapters = new Map<string, ChatTransportAdapter>();

  register(adapter: ChatTransportAdapter): void {
    const key = adapter.transport.trim();
    if (!key) {
      throw new Error('transport id is required');
    }
    if (this.adapters.has(key)) {
      throw new Error(`Transport adapter '${key}' already registered`);
    }
    this.adapters.set(key, adapter);
  }

  get(transport: string): ChatTransportAdapter {
    const adapter = this.adapters.get(transport);
    if (!adapter) {
      throw new ChatTransportError(
        'transport_not_registered',
        `Transport adapter '${transport}' is not registered`,
        { transport }
      );
    }
    return adapter;
  }

  list(): ChatTransportAdapter[] {
    return [...this.adapters.values()];
  }

  resolveMode(transport: string, requested: ChatResponseMode = 'sync'): ChatModeResolution {
    const adapter = this.get(transport);
    if (requested === 'sync') {
      if (!adapter.capabilities.supportsSync) {
        throw new ChatTransportError(
          'unsupported_mode',
          `Transport '${transport}' does not support sync mode`,
          { transport }
        );
      }
      return { requested, selected: 'sync', reason: 'exact' };
    }

    if (requested === 'stream') {
      if (adapter.capabilities.supportsStream) {
        return { requested, selected: 'stream', reason: 'exact' };
      }
      if (adapter.capabilities.supportsSync) {
        return { requested, selected: 'sync', reason: 'fallback_stream_to_sync' };
      }
      throw new ChatTransportError(
        'unsupported_mode',
        `Transport '${transport}' does not support stream or sync mode`,
        { transport }
      );
    }

    if (adapter.capabilities.supportsWebsocket) {
      return { requested, selected: 'websocket', reason: 'exact' };
    }
    if (adapter.capabilities.supportsSync) {
      return { requested, selected: 'sync', reason: 'fallback_websocket_to_sync' };
    }
    throw new ChatTransportError(
      'unsupported_mode',
      `Transport '${transport}' does not support websocket or sync mode`,
      { transport }
    );
  }
}
