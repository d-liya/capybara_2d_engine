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
