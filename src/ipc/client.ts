import { randomBytes } from "node:crypto";
import { connect, type Socket } from "node:net";
import { paths } from "../config/paths.js";
import {
  type ClientMessage,
  type CommandResponse,
  type DaemonMessage,
  decode,
  encode,
  type StateSnapshot,
  type StateUpdate,
} from "../daemon/protocol.js";

export class IpcClient {
  private socket: Socket | null = null;
  private buffer = "";
  private responseHandlers = new Map<
    string,
    { resolve: (r: CommandResponse) => void; reject: (e: Error) => void }
  >();
  private onUpdate: ((msg: StateSnapshot | StateUpdate) => void) | null = null;
  private onDisconnect: (() => void) | null = null;

  connect(socketPath?: string): Promise<void> {
    const path = socketPath ?? paths.socketPath;
    return new Promise((resolve, reject) => {
      this.socket = connect(path, () => resolve());
      this.socket.on("error", (err) => {
        reject(err);
        this.cleanup();
      });
      this.socket.on("close", () => {
        this.onDisconnect?.();
        this.cleanup();
      });
      this.socket.on("data", (data) => this.handleData(data));
    });
  }

  subscribe(
    onUpdate: (msg: StateSnapshot | StateUpdate) => void,
    onDisconnect?: () => void,
  ): void {
    this.onUpdate = onUpdate;
    this.onDisconnect = onDisconnect ?? null;
    this.send({ type: "subscribe" });
  }

  async sendCommand(
    name: string,
    args: Record<string, unknown> = {},
    timeoutMs = 5000,
  ): Promise<CommandResponse> {
    const id = randomBytes(4).toString("hex");
    return new Promise<CommandResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseHandlers.delete(id);
        reject(new Error(`Command "${name}" timed out`));
      }, timeoutMs);

      this.responseHandlers.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      this.send({ type: "command", id, name, args });
    });
  }

  disconnect(): void {
    this.socket?.end();
    this.cleanup();
  }

  get connected(): boolean {
    return this.socket != null && !this.socket.destroyed;
  }

  private send(msg: ClientMessage): void {
    if (!this.socket?.writable) return;
    this.socket.write(encode(msg));
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    let newlineIdx = this.buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);
      this.handleLine(line);
      newlineIdx = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    const msg = decode(line) as DaemonMessage | null;
    if (!msg) return;

    if (msg.type === "response") {
      const handler = this.responseHandlers.get(msg.id);
      if (handler) {
        this.responseHandlers.delete(msg.id);
        handler.resolve(msg);
      }
      return;
    }

    if (msg.type === "snapshot" || msg.type === "update") {
      this.onUpdate?.(msg);
    }
  }

  private cleanup(): void {
    for (const handler of this.responseHandlers.values()) {
      handler.reject(new Error("Connection closed"));
    }
    this.responseHandlers.clear();
    this.socket = null;
  }
}

export async function tryConnect(): Promise<IpcClient | null> {
  const client = new IpcClient();
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}
