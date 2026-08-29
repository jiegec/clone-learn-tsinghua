declare module 'domino' {
    function createDOMImplementation(): DOMImplementation;
    function createDocument(html?: string, force?: boolean): Document;
    function createWindow(html?: string, address?: string): Window;
}

declare module '@mixmark-io/domino' {
    export function createDOMImplementation(): DOMImplementation;
    export function createDocument(html?: string, force?: boolean): Document;
    export function createWindow(html?: string, address?: string): Window;
}
