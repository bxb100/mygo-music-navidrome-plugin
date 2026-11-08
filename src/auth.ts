import { call, setting } from "./api";
import { DEFAULT_IMAGE } from "./constants";
import { clearRadio } from "./radio";
import type { Account } from "./types";

export async function signIn(): Promise<Account> {
  await call("ping");
  const me: Account = { id: setting("username"), name: setting("username"), imageUrl: DEFAULT_IMAGE };
  host.storage.set("account", me);
  return me;
}

export function signOut(): void {
  host.storage.remove("account");
  clearRadio();
}

export function account(): Account | null {
  const me = host.storage.get("account");
  if (!me) return null;
  return { ...me, imageUrl: me.imageUrl || DEFAULT_IMAGE };
}

export function setSetting({ key }: { key: string }): void {
  if (key === "serverUrl" || key === "username" || key === "password") {
    host.storage.remove("account");
    clearRadio();
  }
}
