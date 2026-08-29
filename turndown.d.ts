declare module 'turndown' {
    export interface Options {
        headingStyle?: 'setext' | 'atx';
        hr?: string;
        bulletListMarker?: '-' | '+' | '*';
        codeBlockStyle?: 'indented' | 'fenced';
        emDelimiter?: '_' | '*';
        strongDelimiter?: '**' | '__';
        linkStyle?: 'inlined' | 'referenced';
        linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
    }

    export default class TurndownService {
        constructor(options?: Options);
        turndown(html: string | Node): string;
        addRule(key: string, rule: object): this;
        remove(filter: string | ((node: HTMLElement, options: object) => boolean)): this;
        keep(filter: string | string[]): this;
        use(plugin: object): this;
    }
}
