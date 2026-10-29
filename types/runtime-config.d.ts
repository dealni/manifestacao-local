export interface NumericOptions {
  emailDeliveryTimeoutMs?: number;
  port?: number;
  maxBodyBytes?: number;
  maxPlayers?: number;
  maxConnectionsPerIp?: number;
  maxUploadsBytes?: number;
  wsMaxConnections?: number;
  wsMessagesPerSecond?: number;
  wsChatPer10Seconds?: number;
  wsActionsPerSecond?: number;
  wsJoinPerMinute?: number;
  rateLimitRequests?: number;
  rateLimitWindowMs?: number;
}

/** Sobrescritas de código; valores de ambiente são tratados separadamente como strings. */
export interface RuntimeOptions extends NumericOptions {
  production?: boolean;
  publicOrigin?: string;
  host?: string;
  emailApiToken?: string;
  emailCodeSecret?: string;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
  emailAccountId?: string;
  emailFrom?: string;
  emailReplyTo?: string;
  databaseUrl?: string | null;
  databaseStateKey?: string;
  dataDir?: string;
  publicDir?: string;
  trustProxy?: boolean;
}

/** Interface estrutural aceita requisições HTTP e HTTPS nativas. */
export interface RuntimeRequest {
  headers: import('node:http').IncomingHttpHeaders;
  socket: { remoteAddress?: string; encrypted?: boolean };
}
