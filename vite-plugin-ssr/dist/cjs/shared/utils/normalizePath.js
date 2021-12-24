"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePath = void 0;
const assert_1 = require("./assert");
const isBrowser_1 = require("./isBrowser");
function normalizePath(urlPath) {
    (0, assert_1.assert)(!(0, isBrowser_1.isBrowser)());
    if (!isWindows()) {
        return urlPath;
    }
    const req = require;
    return urlPath.split(req('path').sep).join('/');
}
exports.normalizePath = normalizePath;
function isWindows() {
    // `process` is `undefined` in Cloudlfare Pages workers
    if (typeof process === 'undefined') {
        return false;
    }
    return process.platform === 'win32';
}
//# sourceMappingURL=normalizePath.js.map