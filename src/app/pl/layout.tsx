import type { ReactNode } from "react";
// Cycle 2's tokens, focus treatments and tile/table idiom, imported rather than copied: two token
// blocks would be two palettes that drift. place.css adds only the classes /pl needs.
import "../p/mandate.css";
import "./place.css";

/** The MANDATE subtree, same wrapper as /p — no html/body, the untouched root layout owns those. */
export default function PlaceLayout({ children }: { children: ReactNode }) {
  return <div className="mandate">{children}</div>;
}
