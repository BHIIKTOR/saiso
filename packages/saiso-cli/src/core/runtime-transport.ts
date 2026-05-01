export interface RuntimeTransportDescriptor {
  transport: string;
  capabilities: {
    supportsSync: boolean;
    supportsStream: boolean;
    supportsWebsocket: boolean;
    supportsButtons: boolean;
    supportsMedia: boolean;
    supportsTopics: boolean;
    supportsCallbacks: boolean;
  };
}

const RUNTIME_TRANSPORT_CATALOG: RuntimeTransportDescriptor[] = [
  {
    transport: 'telegram',
    capabilities: {
      supportsSync: true,
      supportsStream: false,
      supportsWebsocket: false,
      supportsButtons: true,
      supportsMedia: true,
      supportsTopics: true,
      supportsCallbacks: true,
    },
  },
  {
    transport: 'webhook',
    capabilities: {
      supportsSync: true,
      supportsStream: false,
      supportsWebsocket: false,
      supportsButtons: false,
      supportsMedia: false,
      supportsTopics: false,
      supportsCallbacks: false,
    },
  },
];

export function getRuntimeTransportCatalog(): RuntimeTransportDescriptor[] {
  return RUNTIME_TRANSPORT_CATALOG.map((entry) => ({
    transport: entry.transport,
    capabilities: { ...entry.capabilities },
  }));
}
