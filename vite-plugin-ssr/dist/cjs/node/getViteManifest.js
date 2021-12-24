"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getViteManifest = exports.setViteManifest = void 0;
const ssrEnv_1 = require("./ssrEnv");
const utils_1 = require("../shared/utils");
var clientManifest = null;
var serverManifest = null;
var pluginManifest = null;
function getViteManifest() {
    const { root, outDir } = (0, ssrEnv_1.getSsrEnv)();
    const outDirPath = `${root}/${outDir}`;
    const clientManifestPath = `${outDirPath}/client/manifest.json`;
    const serverManifestPath = `${outDirPath}/server/manifest.json`;
    const pluginManifestPath = `${outDirPath}/client/vite-plugin-ssr.json`;
    if (!clientManifest) {
        try {
            clientManifest = require(clientManifestPath);
        }
        catch (err) { }
    }
    if (!serverManifest) {
        try {
            serverManifest = require(serverManifestPath);
        }
        catch (err) { }
    }
    if (!pluginManifest) {
        try {
            pluginManifest = require(pluginManifestPath);
        }
        catch (err) { }
    }
    return {
        clientManifest,
        serverManifest,
        clientManifestPath,
        serverManifestPath,
        pluginManifest,
        pluginManifestPath,
        outDirPath,
    };
}
exports.getViteManifest = getViteManifest;
function setViteManifest(manifests) {
    clientManifest = manifests.clientManifest;
    serverManifest = manifests.serverManifest;
    pluginManifest = manifests.pluginManifest;
    (0, utils_1.assert)(clientManifest && serverManifest && pluginManifest);
}
exports.setViteManifest = setViteManifest;
//# sourceMappingURL=getViteManifest.js.map