import assert from "node:assert/strict";
import test from "node:test";
import { FileProcessor } from "../src/file-processor.ts";

class RejectingWorker {
  listeners = new Map();

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  postMessage(message) {
    queueMicrotask(() => {
      this.listeners.get("message")?.({
        data: { id: message.id, ok: false, error: "Simulated worker failure." }
      });
    });
  }

  terminate() {}
}

function installHostedBrowserStub() {
  const originalWindow = globalThis.window;
  const originalWorker = globalThis.Worker;
  globalThis.window = {
    location: { protocol: "https:" },
    Worker: RejectingWorker,
    setTimeout,
    clearTimeout
  };
  globalThis.Worker = RejectingWorker;

  return () => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  };
}

test("does not fall back to main-thread parsing after a hosted worker failure", async () => {
  const restore = installHostedBrowserStub();
  const processor = new FileProcessor();
  try {
    const buffer = new TextEncoder().encode("Name,Email\nA,a@example.com").buffer;
    await assert.rejects(
      processor.load("csv", buffer),
      /Simulated worker failure\. The file was not processed\./
    );
  } finally {
    processor.dispose();
    restore();
  }
});

test("does not fall back to main-thread export after a hosted worker failure", async () => {
  const restore = installHostedBrowserStub();
  const processor = new FileProcessor();
  try {
    await assert.rejects(
      processor.exportRows("csv", [["Name"], ["A"]]),
      /Simulated worker failure\. No file was downloaded\./
    );
  } finally {
    processor.dispose();
    restore();
  }
});
