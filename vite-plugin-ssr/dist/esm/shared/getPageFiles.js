import { getSsrEnv } from '../node/ssrEnv';
import { assert, assertUsage, getPathDistance, hasProp, isBrowser, lowerFirst } from './utils';
export { getAllPageFiles };
export { findPageFile };
export { findDefaultFiles };
export { findDefaultFile };
export { setPageFiles };
export { setPageFilesAsync };
export { isPageFilesSet };
assertNotAlreadyLoaded();
let allPageFilesUnprocessed;
function setPageFiles(pageFiles) {
    assert(hasProp(pageFiles, '.page'));
    allPageFilesUnprocessed = pageFiles;
}
function isPageFilesSet() {
    return !!allPageFilesUnprocessed;
}
let asyncGetter;
function setPageFilesAsync(getter) {
    asyncGetter = getter;
}
const fileTypes = ['.page', '.page.server', '.page.route', '.page.client'];
async function getAllPageFiles() {
    if (asyncGetter) {
        const ssrEnv = getSsrEnv();
        if (!allPageFilesUnprocessed ||
            // We reload all glob imports in dev to make auto-reload work
            !ssrEnv.isProduction) {
            allPageFilesUnprocessed = (await asyncGetter());
        }
        assert(hasProp(allPageFilesUnprocessed, '.page'));
    }
    assert(hasProp(allPageFilesUnprocessed, '.page'));
    const tranform = (pageFiles) => {
        return Object.entries(pageFiles).map(([filePath, loadFile]) => {
            return { filePath, loadFile };
        });
    };
    const allPageFiles = {
        '.page': tranform(allPageFilesUnprocessed['.page']),
        '.page.route': tranform(allPageFilesUnprocessed['.page.route']),
        '.page.server': tranform(allPageFilesUnprocessed['.page.server']),
        '.page.client': tranform(allPageFilesUnprocessed['.page.client']),
    };
    return allPageFiles;
}
function findPageFile(pageFiles, pageId) {
    pageFiles = pageFiles.filter(({ filePath }) => {
        assert(filePath.startsWith('/'));
        assert(pageId.startsWith('/'));
        assert(!filePath.includes('\\'));
        assert(!pageId.includes('\\'));
        return filePath.startsWith(`${pageId}.page.`);
    });
    if (pageFiles.length === 0) {
        return null;
    }
    assertUsage(pageFiles.length === 1, 'Conflicting ' + pageFiles.map(({ filePath }) => filePath).join(' '));
    const pageFile = pageFiles[0];
    assert(pageFile);
    return pageFile;
}
function findDefaultFiles(pageFiles) {
    const defaultFiles = pageFiles.filter(({ filePath }) => {
        assert(filePath.startsWith('/'));
        assert(!filePath.includes('\\'));
        return filePath.includes('/_default');
    });
    return defaultFiles;
}
function assertNotAlreadyLoaded() {
    // The functionality of this file will fail if it's loaded more than
    // once; we assert that it's loaded only once.
    const alreadyLoaded = Symbol();
    const globalObject = isBrowser() ? window : global;
    assert(!globalObject[alreadyLoaded]);
    globalObject[alreadyLoaded] = true;
}
function findDefaultFile(pageFiles, pageId) {
    const defautFiles = findDefaultFiles(pageFiles);
    // Sort `_default.page.server.js` files by filesystem proximity to pageId's `*.page.js` file
    defautFiles.sort(lowerFirst(({ filePath }) => {
        if (filePath.startsWith(pageId))
            return -1;
        return getPathDistance(pageId, filePath);
    }));
    return defautFiles[0] || null;
}
//# sourceMappingURL=getPageFiles.js.map