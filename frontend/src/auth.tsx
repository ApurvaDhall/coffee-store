import { createContext, useContext } from "react";
import type { AuthMeResponse } from "./lib/api";

export type AuthState = {
  status: "loading" | "authenticated" | "unauthenticated";
  profile: AuthMeResponse | null;
  refresh: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthContext provider");
  }
  return value;
}
