import type { ReactNode } from "react";

export function Greeting({ name }: { name?: string; children?: ReactNode }) {
  return <h1>Hello{name ? `, ${name}` : ""}!</h1>;
}
