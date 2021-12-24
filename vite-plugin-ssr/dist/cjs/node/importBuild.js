"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importBuildWasLoaded = exports.importBuild = void 0;
const createPageRenderer_1 = require("./createPageRenderer");
const getViteManifest_1 = require("./getViteManifest");
const getPageFiles_1 = require("../shared/getPageFiles");
const utils_1 = require("../shared/utils");
let wasCalled = false;
function importBuildWasLoaded() {
    return wasCalled;
}
exports.importBuildWasLoaded = importBuildWasLoaded;
function importBuild({ pageFiles, clientManifest, serverManifest, pluginManifest, }) {
    (0, utils_1.assertUsage)(wasCalled === false, 'You are trying to load `dist/server/importBuild.js` a second time, but it should be loaded only once.');
    (0, utils_1.assertUsage)((0, createPageRenderer_1.createPageRendererWasCalled)() === false, 'You are trying to load `dist/server/importBuild.js` after calling `createPageRenderer()`. Make sure to load `dist/server/importBuild.js` before calling `createPageRenderer()` instead.');
    (0, getPageFiles_1.setPageFiles)(pageFiles);
    (0, getViteManifest_1.setViteManifest)({ clientManifest, serverManifest, pluginManifest });
    wasCalled = true;
}
exports.importBuild = importBuild;
//# sourceMappingURL=importBuild.js.map