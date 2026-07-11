import { paths } from "../config/paths.js";
import type { SessionSnapshot } from "../daemon/protocol.js";
import { IpcClient } from "../ipc/client.js";
import { render } from "./renderer.js";

let currentSessions: SessionSnapshot[] = [];
let connected = false;
let cols = 40;
let rows = 24;
let lastRenderedOutput = "";

function updateSize(): void {
  cols = process.stdout.columns ?? 40;
  rows = process.stdout.rows ?? 24;
}

function redraw(): void {
  updateSize();
  const output = render(currentSessions, cols, rows, connected);
  if (output === lastRenderedOutput) return;
  lastRenderedOutput = output;
  process.stdout.write(output);
}

async function connectWithRetry(client: IpcClient): Promise<void> {
  const maxRetries = 60;
  const retryMs = 1000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await client.connect(paths.socketPath);
      return;
    } catch {
      if (attempt === 0) {
        process.stderr.write("Waiting for workd...\n");
      }
      await new Promise((r) => setTimeout(r, retryMs));
    }
  }
  throw new Error("workd not available after 60s");
}

export async function startSidebar(): Promise<void> {
  process.title = "work sidebar";

  process.stdout.write("\x1b[?25l"); // hide cursor
  process.stdout.write("\x1b[?1049h"); // alternate screen

  process.on("SIGWINCH", redraw);
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  // Suppress stdin echo, allow raw keypress handling
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      if (data[0] === 0x03 || data[0] === 0x71) {
        // Ctrl-C or 'q'
        cleanup();
      }
    });
  }

  updateSize();
  redraw();

  const client = new IpcClient();

  try {
    await connectWithRetry(client);
    connected = true;

    client.subscribe(
      (msg) => {
        if (msg.type === "snapshot" || msg.type === "update") {
          currentSessions = msg.sessions;
          redraw();
        }
      },
      () => {
        connected = false;
        currentSessions = [];
        redraw();
        reconnectLoop(client);
      },
    );

    redraw();
  } catch (err) {
    connected = false;
    redraw();
    process.stderr.write(
      `Failed to connect to workd: ${err instanceof Error ? err.message : err}\n`,
    );
    reconnectLoop(client);
  }
}

async function reconnectLoop(_client: IpcClient): Promise<void> {
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const newClient = new IpcClient();
      await newClient.connect(paths.socketPath);
      connected = true;

      newClient.subscribe(
        (msg) => {
          if (msg.type === "snapshot" || msg.type === "update") {
            currentSessions = msg.sessions;
            redraw();
          }
        },
        () => {
          connected = false;
          currentSessions = [];
          redraw();
          reconnectLoop(newClient);
        },
      );

      redraw();
      return;
    } catch {
      // keep trying
    }
  }
}

function cleanup(): void {
  process.stdout.write("\x1b[?25h"); // show cursor
  process.stdout.write("\x1b[?1049l"); // exit alternate screen
  process.exit(0);
}
