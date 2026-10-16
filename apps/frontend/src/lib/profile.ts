import { useSyncExternalStore } from "react";
import { readJson, removeKey, writeJson } from "./storage";

// Lives in this browser until there are accounts on the server; swapping this
// module for API calls is all that wiring them up should take.
const KEY = "ada-twin:profile";

export interface Profile {
  name: string;
  avatarSeed: string;
}

const listeners = new Set<() => void>();
let cached: Profile | null | undefined;

function read(): Profile | null {
  if (cached === undefined) cached = readJson<Profile>(KEY);
  return cached;
}

function emit() {
  for (const listener of listeners) listener();
}

export function getProfile() {
  return read();
}

export function saveProfile(profile: Profile) {
  cached = profile;
  writeJson(KEY, profile);
  emit();
}

export function signOut() {
  cached = null;
  removeKey(KEY);
  emit();
}

export function useProfile() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
  );
}

export function firstName(profile: Profile) {
  return profile.name.trim().split(/\s+/)[0] ?? profile.name;
}
