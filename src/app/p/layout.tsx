import type { ReactNode } from "react";
import "./mandate.css";

/** The MANDATE subtree. Tokens live on .mandate (see mandate.css) so the old app's globals and
 *  tailwind theme keep owning everything outside /p. No html/body here — the root layout has them. */
export default function MandateLayout({ children }: { children: ReactNode }) {
  return <div className="mandate">{children}</div>;
}
