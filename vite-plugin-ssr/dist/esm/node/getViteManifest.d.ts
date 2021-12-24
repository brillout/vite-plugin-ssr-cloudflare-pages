export { setViteManifest };
export { getViteManifest };
export { ViteManifest };
export type { PluginManifest };
declare type ViteManifest = Record<string, {
    src?: string;
    file: string;
    css?: string[];
    assets?: string[];
    isEntry?: boolean;
    isDynamicEntry?: boolean;
    imports?: string[];
    dynamicImports?: string[];
}>;
declare type PluginManifest = {
    version: string;
    base: string;
    usesClientRouter: boolean;
};
declare function getViteManifest(): {
    clientManifest: null | ViteManifest;
    serverManifest: null | ViteManifest;
    pluginManifest: null | PluginManifest;
    clientManifestPath: string;
    serverManifestPath: string;
    pluginManifestPath: string;
    outDirPath: string;
};
declare function setViteManifest(manifests: {
    clientManifest: unknown;
    serverManifest: unknown;
    pluginManifest: unknown;
}): void;
//# sourceMappingURL=getViteManifest.d.ts.map