import './page-files/setup';
export { prerender };
/**
 * Render your pages (e.g. for deploying to a static host).
 * @param partial Allow only a subset of pages to be pre-rendered.
 * @param root The root directory of your project (where `vite.config.js` live) (default: `process.cwd()`).
 * @param outDir The build directory of your project (default: `dist`).
 */
declare function prerender({ onPagePrerender, pageContextInit, partial, noExtraDir, root, outDir, parallel, base, }: {
    onPagePrerender?: Function | null;
    pageContextInit?: Record<string, unknown>;
    partial?: boolean;
    noExtraDir?: boolean;
    root?: string;
    outDir?: string;
    base?: string;
    parallel?: number;
}): Promise<void>;
//# sourceMappingURL=prerender.d.ts.map