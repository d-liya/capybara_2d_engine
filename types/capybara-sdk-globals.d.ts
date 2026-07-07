export interface GameServerClientOptions {
  baseUrl?: string;
  tokenStorageKey?: string;
  bearerToken?: string;
}
export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  isAnonymous: boolean | null;
}
export interface Session {
  id: string;
  expiresAt: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  userId: string;
}
export interface SessionResponse {
  session: Session;
  user: User;
}
export interface SignInResponse {
  token: string;
  user: User;
}
export interface OtpSentResponse {
  stage: "otp_sent";
  email: string;
}
export interface SaveRecord {
  gameId: string;
  data: Record<string, any>;
  updatedAt: string;
}
export interface SharedStateRecord {
  gameId: string;
  data: Record<string, any> | null;
  updatedAt?: string;
  updatedBy?: string | null;
}
export interface KvRecord<T = any> {
  gameId: string;
  key: string;
  value: T;
}
export interface SetKvResponse<T = any> {
  ok: true;
  gameId: string;
  key: string;
  value: T;
}
export interface DeleteKvResponse {
  ok: true;
  gameId: string;
  key: string;
}
export interface SpeechVoice {
  voiceName: string;
  style: string;
}
export interface SpeechVoicesResponse {
  defaultVoice: string;
  voices: SpeechVoice[];
}
export interface SpeechSynthesizeParams {
  text: string;
  gameId: string;
  voiceName?: string;
  speakers?: Array<{
    speaker: string;
    voiceName: string;
  }>;
}
export interface BinaryResponse {
  contentType: string;
  data: ArrayBuffer;
}
export interface LlmResponsePayload {
  input?: string | Array<Record<string, any>>;
  messages?: Array<Record<string, any>>;
  model?: string;
  stream?: boolean;
  instructions?: string;
  metadata?: Record<string, any>;
  previous_response_id?: string;
  prompt_cache_key?: string;
  prompt_cache_retention?: "in_memory" | "24h";
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  [key: string]: any;
}
export interface LlmUsage {
  input_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
    [key: string]: any;
  };
  output_tokens?: number;
  output_tokens_details?: Record<string, any>;
  total_tokens?: number;
  cost?: number;
  [key: string]: any;
}
export interface LlmResponse {
  id?: string;
  object?: "response" | string;
  created_at?: number;
  model?: string;
  output_text?: string;
  output?: Array<Record<string, any>>;
  usage?: LlmUsage;
  [key: string]: any;
}
export interface ResponseStreamEvent {
  type?: string;
  delta?: string;
  response?: LlmResponse;
  usage?: LlmUsage;
  [key: string]: any;
}
export interface RoomState {
  state: Record<string, any>;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
export interface RoomStateResponse {
  gameId: string;
  roomId: string;
  state: Record<string, any>;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
export interface JoinRoomResponse {
  ok: true;
  gameId: string;
  roomId: string;
  userId: string;
  state: RoomState;
}
export interface LeaveRoomResponse {
  ok: true;
  gameId: string;
  roomId: string;
  userId: string;
}
export interface PresenceEntry {
  userId: string;
  joinedAt: string;
  metadata: Record<string, any>;
}
export interface RoomPresenceResponse {
  gameId: string;
  roomId: string;
  count: number;
  players: PresenceEntry[];
}
export interface SpeechToAudioHandle {
  context: AudioContext;
  done: Promise<BinaryResponse>;
  stop: () => void;
}
export interface InternalRequestInit extends Omit<RequestInit, "body"> {
  body?: any;
}
export interface ChatStreamRequestInit extends InternalRequestInit {
  signal?: AbortSignal;
}
export interface PlaytimeEvent {
  eventId: string;
  sessionId: string;
  gameId: string;
  type: "segment" | "end";
  startedAt: string;
  occurredAt: string;
  durationSeconds: number;
}
export interface PlaytimeTracker {
  sessionId: string;
  gameId: string;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
}
export declare class GameServerError extends Error {
  status: number;
  payload: any;
  constructor(message: string, status: number, payload: any);
}
export declare class GameServerClient {
  baseUrl: string;
  tokenStorageKey: string;
  private _inMemoryToken;
  private _playtimeTrackers;
  constructor(options?: GameServerClientOptions);
  private _url;
  private _getStorage;
  getBearerToken(): string;
  setBearerToken(token: string): string;
  clearBearerToken(): void;
  private _storeBearerTokenFromResponse;
  private _fetch;
  private _request;
  private _requestBinary;
  private _requestOpenAiSseStream;
  authWithEmailOtp(params: {
    email: string;
    otp?: string;
    name?: string;
    image?: string;
  }): Promise<OtpSentResponse | SignInResponse>;
  signInGuest(): Promise<SignInResponse>;
  getSession(): Promise<SessionResponse>;
  signOut(): Promise<{
    ok: true;
  }>;
  private _playtimeStorageKey;
  private _readQueuedPlaytimeEvents;
  private _writeQueuedPlaytimeEvents;
  private _queuePlaytimeEvent;
  private _flushPlaytimeEvents;
  startPlaytimeTracking(gameId: string): PlaytimeTracker;
  getSave(gameId: string): Promise<SaveRecord>;
  updateSave(
    gameId: string,
    data: Record<string, any>,
  ): Promise<{
    ok: true;
  }>;
  getSharedState(gameId: string): Promise<SharedStateRecord>;
  updateSharedState(
    gameId: string,
    data: Record<string, any>,
  ): Promise<{
    ok: true;
  }>;
  getKv<T = any>(gameId: string, key: string): Promise<KvRecord<T>>;
  setKv<T = any>(
    gameId: string,
    key: string,
    value: T,
  ): Promise<SetKvResponse<T>>;
  deleteKv(gameId: string, key: string): Promise<DeleteKvResponse>;
  completeChat(
    gameId: string,
    payload: LlmResponsePayload,
  ): AsyncGenerator<ResponseStreamEvent, void, unknown>;
  completeChat(
    gameId: string,
    payload: LlmResponsePayload & {
      stream: false;
    },
  ): Promise<LlmResponse | Record<string, any>>;
  completeChatNonStreaming(
    gameId: string,
    payload: Omit<LlmResponsePayload, "stream"> & {
      stream?: false;
    },
  ): Promise<LlmResponse | Record<string, any>>;
  getSpeechVoices(): Promise<SpeechVoicesResponse>;
  synthesizeSpeech(params: SpeechSynthesizeParams): Promise<BinaryResponse>;
  synthesizeSpeechToAudio(params: {
    text: string;
    gameId: string;
    voiceName?: string;
    speakers?: Array<{
      speaker: string;
      voiceName: string;
    }>;
    audioContext?: AudioContext;
    onStart?: () => void;
    onComplete?: (res: BinaryResponse) => void;
    onStop?: (reason: string) => void;
    onError?: (error: Error) => void;
  }): SpeechToAudioHandle;
  joinRoom(
    gameId: string,
    roomId: string,
    metadata?: Record<string, any>,
  ): Promise<JoinRoomResponse>;
  leaveRoom(gameId: string, roomId: string): Promise<LeaveRoomResponse>;
  getRoomState(gameId: string, roomId: string): Promise<RoomStateResponse>;
  updateRoomState(
    gameId: string,
    roomId: string,
    state: Record<string, any>,
    expectedVersion: number,
  ): Promise<RoomStateResponse>;
  getRoomPresence(
    gameId: string,
    roomId: string,
  ): Promise<RoomPresenceResponse>;
}
