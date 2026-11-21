// pdf.js ships no types for its worker module; it is only loaded for its side
// of the message channel, never called directly.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
