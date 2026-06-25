// Minimal ambient declaration — turndown-plugin-gfm ships no types and has
// no DefinitelyTyped entry. The plugin is a single function that mutates a
// TurndownService instance; we only need the call to type-check.
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export function gfm(service: TurndownService): void;
  export function tables(service: TurndownService): void;
  export function strikethrough(service: TurndownService): void;
}
