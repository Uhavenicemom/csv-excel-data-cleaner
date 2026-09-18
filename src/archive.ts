interface ZipArchive {
  file(name: string, data: Uint8Array | string): ZipArchive;
  generateAsync(options: {
    type: "arraybuffer";
    compression: "DEFLATE";
    compressionOptions: { level: number };
    platform: "DOS";
  }): Promise<ArrayBuffer>;
}

interface ZipConstructor {
  new(): ZipArchive;
}

declare global {
  interface Window {
    JSZip?: ZipConstructor;
  }
}

const JSZIP_SCRIPT_URL = "vendor/jszip.min.js";
let zipLoadPromise: Promise<ZipConstructor> | null = null;

function loadZipConstructor(): Promise<ZipConstructor> {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (zipLoadPromise) return zipLoadPromise;
  const script = document.createElement("script");
  script.src = JSZIP_SCRIPT_URL;
  script.async = true;
  zipLoadPromise = new Promise<ZipConstructor>((resolve, reject) => {
    script.addEventListener("load", () => {
      if (window.JSZip) resolve(window.JSZip);
      else reject(new Error("ZIP support loaded without its expected API."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("ZIP support could not be loaded. Reload and try again.")), { once: true });
  }).catch((error: unknown) => {
    zipLoadPromise = null;
    script.remove();
    throw error;
  });
  document.head.append(script);
  return zipLoadPromise;
}

export async function createZip(
  files: readonly { name: string; data: ArrayBuffer | Uint8Array | string }[]
): Promise<ArrayBuffer> {
  const Zip = await loadZipConstructor();
  const archive = new Zip();
  files.forEach(({ name, data }) => archive.file(name, typeof data === "string" ? data : new Uint8Array(data)));
  return archive.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "DOS" });
}
