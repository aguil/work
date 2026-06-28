import { createServer, type Server, type Socket } from "node:net";
import { unlinkSync } from "node:fs";
import { paths } from "../config/paths.js";
import { encode, decode, type DaemonMessage, type StateSnapshot } from "./protocol.js";
import { aggregateState } from "./state-aggregator.js";

type ConnectedClient = {
  socket: Socket;
  subscribed: boolean;
  buffer: string;
};

export class DaemonServer {
  private server: Server;
  private clients: Set<ConnectedClient> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastState: ReturnType<typeof aggregateState> | null = null;
  private pollIntervalMs: number;

  constructor(pollIntervalMs = 2000) {
    this.pollIntervalMs = pollIntervalMs;
    this.server = createServer((socket) => this.handleConnection(socket));
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        unlinkSync(paths.socketPath);
      } catch {
        // socket file may not exist
      }

      this.server.listen(paths.socketPath, () => {
        this.startPolling();
        resolve();
      });

      this.server.on("error", reject);
    });
  }

  stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    for (const client of this.clients) {
      client.socket.destroy();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.server.close(() => {
        try {
          unlinkSync(paths.socketPath);
        } catch {
          // already gone
        }
        resolve();
      });
    });
  }

  private handleConnection(socket: Socket): void {
    const client: ConnectedClient = { socket, subscribed: false, buffer: "" };
    this.clients.add(client);

    socket.on("data", (data) => {
      client.buffer += data.toString();
      let newlineIdx: number;
      while ((newlineIdx = client.buffer.indexOf("\n")) !== -1) {
        const line = client.buffer.slice(0, newlineIdx);
        client.buffer = client.buffer.slice(newlineIdx + 1);
        this.handleMessage(client, line);
      }
    });

    socket.on("close", () => {
      this.clients.delete(client);
    });

    socket.on("error", () => {
      this.clients.delete(client);
    });
  }

  private handleMessage(client: ConnectedClient, line: string): void {
    const msg = decode(line);
    if (!msg) return;

    if (msg.type === "subscribe") {
      client.subscribed = true;
      if (this.lastState) {
        const snapshot: StateSnapshot = {
          type: "snapshot",
          sessions: this.lastState.sessions,
          timestamp: this.lastState.timestamp,
        };
        this.send(client, snapshot);
      }
      return;
    }

    if (msg.type === "command") {
      this.handleCommand(client, msg);
      return;
    }
  }

  private handleCommand(
    client: ConnectedClient,
    msg: { type: "command"; id: string; name: string; args: Record<string, unknown> },
  ): void {
    try {
      switch (msg.name) {
        case "refresh": {
          this.poll();
          this.send(client, { type: "response", id: msg.id, ok: true });
          break;
        }
        case "state": {
          const state = this.lastState ?? aggregateState();
          this.send(client, {
            type: "response",
            id: msg.id,
            ok: true,
            data: state,
          });
          break;
        }
        default:
          this.send(client, {
            type: "response",
            id: msg.id,
            ok: false,
            error: `Unknown command: ${msg.name}`,
          });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.send(client, {
        type: "response",
        id: msg.id,
        ok: false,
        error: message,
      });
    }
  }

  private send(client: ConnectedClient, msg: DaemonMessage): void {
    if (!client.socket.writable) return;
    client.socket.write(encode(msg));
  }

  private broadcast(msg: DaemonMessage): void {
    const data = encode(msg);
    for (const client of this.clients) {
      if (client.subscribed && client.socket.writable) {
        client.socket.write(data);
      }
    }
  }

  private startPolling(): void {
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  poll(): void {
    try {
      const state = aggregateState();
      this.lastState = state;
      this.broadcast({
        type: "update",
        sessions: state.sessions,
        timestamp: state.timestamp,
      });
    } catch {
      // tmux server may be unavailable; continue polling
    }
  }
}
