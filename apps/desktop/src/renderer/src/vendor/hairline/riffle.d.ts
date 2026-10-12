export interface Figure { update(options: {intensity?:number; theme?:'auto'|'light'|'dark'; play?:boolean}):void; destroy():void }
export function riffle(element:HTMLElement, options?:{intensity?:number; label?:string; play?:boolean; onRead?:(text:string)=>void}):Figure;

export const drawer: typeof riffle;
export const terminal: typeof riffle;
export const cabinet: typeof riffle;
export const turntable: typeof riffle;
