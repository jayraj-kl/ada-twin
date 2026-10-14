import type { AskModel, Machine, ModelRequest } from "@repo/agent";

export const PANORAMA = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/png",
};
export const PUMPS: Machine = {
  id: "pumps",
  name: "Feed pumps",
  type: "centrifugal pump",
  manufacturer: "KSB",
  model: "Etanorm 065",
  count: 2,
};
export const BOILERS: Machine = { id: "boilers", name: "Boilers" };

/** A model that answers each request with whatever `script` returns. */
export function scripted(script: (request: ModelRequest) => unknown) {
  const requests: ModelRequest[] = [];
  const ask: AskModel = async (request) => {
    requests.push(request);
    const answer = script(request);
    return {
      text: typeof answer === "string" ? answer : JSON.stringify(answer),
      sources: [],
    };
  };
  return { ask, requests };
}
