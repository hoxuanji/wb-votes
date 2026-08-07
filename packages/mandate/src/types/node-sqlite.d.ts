// Ambient types for node:sqlite (stable since Node 22.5; this repo pins @types/node@20,
// which predates it). Only the surface packages/mandate actually uses is declared.
//
// ponytail: local shim, not a dependency bump — @types/node is the OLD Next app's
// devDependency and its typecheck already carries 40 pre-existing errors; bumping it to
// chase one module's types risks adding more. Delete this file the moment @types/node
// >= 22 is adopted repo-wide (see docs/debt.md).

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
