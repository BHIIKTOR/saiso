export interface TransportSelection {
  transport: string;
  requestedMode: 'sync' | 'stream' | 'websocket';
}

export function normalizeTransportSelection(input?: {
  transport?: string;
  mode?: string;
}): TransportSelection {
  const transport = (input?.transport || 'telegram').trim().toLowerCase();
  const modeRaw = (input?.mode || 'sync').trim().toLowerCase();

  if (!transport) {
    throw new Error('transport is required');
  }

  if (modeRaw !== 'sync' && modeRaw !== 'stream' && modeRaw !== 'websocket') {
    throw new Error(`unsupported transport mode: ${modeRaw}`);
  }

  return {
    transport,
    requestedMode: modeRaw,
  };
}
