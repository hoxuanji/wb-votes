// Ambient types for node:sqlite (stable since Node 22.5; this repo pins @types/node@20,
// which predates it). Only the surface packages/mandate actually uses is declared.
//
// ponytail: local shim, not a dependency bump — @types/node is shared with the OLD Next app,
// and bumping a dependency the whole repo depends on to obtain types for one module in one
// package is the wrong trade. Delete this file when @types/node >= 22 is adopted repo-wide
// (see docs/debt.md).
//
// An earlier version of this comment justified the shim by claiming the app's typecheck "already
// carries 40 pre-existing errors". That was false — those 40 were this package's own code being
// compiled under the app's config. src/ reports 0. See docs/adr/0002.

declare module 'node:sqlite' {
  /** Values sqlite can bind and return. */
  export type SupportedValueType = null | number | bigint | string | Uint8Array;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...params: SupportedValueType[]): StatementResultingChanges;
    /** Undefined when the query matches no row. */
    get<T = Record<string, SupportedValueType>>(...params: SupportedValueType[]): T | undefined;
    all<T = Record<string, SupportedValueType>>(...params: SupportedValueType[]): T[];
    iterate<T = Record<string, SupportedValueType>>(...params: SupportedValueType[]): IterableIterator<T>;
    setReadBigInts(enabled: boolean): void;
    setAllowBareNamedParameters(enabled: boolean): void;
    readonly sourceSQL: string;
    readonly expandedSQL: string;
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
    allowExtension?: boolean;
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    open(): void;
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
