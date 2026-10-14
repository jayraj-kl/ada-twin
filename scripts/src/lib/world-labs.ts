import { type Operation, createWorldLabsClient } from "@repo/world";

export function worldLabsClient() {
  const apiKey = process.env.WORLD_LABS_API_KEY;
  if (!apiKey) throw new Error("Set WORLD_LABS_API_KEY in scripts/.env");
  return createWorldLabsClient({
    apiKey,
    baseUrl: process.env.WORLD_LABS_API_BASE || undefined,
  });
}

/** An onProgress handler that prints each new status line once. */
export function logProgress() {
  let lastStatus = "";
  return ({ metadata }: Operation) => {
    const status = metadata?.progress?.description ?? "";
    if (status && status !== lastStatus) console.log(`  ${status}`);
    lastStatus = status;
  };
}
