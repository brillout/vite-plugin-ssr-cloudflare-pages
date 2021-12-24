"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prerender = void 0;
require("./page-files/setup");
const path_1 = require("path");
const route_1 = require("../shared/route");
const utils_1 = require("../shared/utils");
const ssrEnv_1 = require("./ssrEnv");
const renderPage_1 = require("./renderPage");
const kolorist_1 = require("kolorist");
const pLimit = require("p-limit");
const os_1 = require("os");
const getViteManifest_1 = require("./getViteManifest");
/**
 * Render your pages (e.g. for deploying to a static host).
 * @param partial Allow only a subset of pages to be pre-rendered.
 * @param root The root directory of your project (where `vite.config.js` live) (default: `process.cwd()`).
 * @param outDir The build directory of your project (default: `dist`).
 */
async function prerender({ onPagePrerender = null, pageContextInit = {}, partial = false, noExtraDir = false, root = process.cwd(), outDir = 'dist', parallel = (0, os_1.cpus)().length || 1, base, }) {
    assertArguments({ partial, noExtraDir, base, root, outDir, parallel });
    (0, utils_1.assert)(base === undefined);
    if (!onPagePrerender) {
        console.log(`${(0, kolorist_1.cyan)(`vite-plugin-ssr ${utils_1.projectInfo.projectVersion}`)} ${(0, kolorist_1.green)('pre-rendering HTML...')}`);
    }
    setProductionEnvVar();
    const ssrEnv = {
        isProduction: true,
        root,
        outDir,
        viteDevServer: undefined,
        baseUrl: '/',
    };
    (0, ssrEnv_1.setSsrEnv)(ssrEnv);
    const { pluginManifest, pluginManifestPath, outDirPath } = (0, getViteManifest_1.getViteManifest)();
    assertPluginManifest(pluginManifest, pluginManifestPath, outDirPath);
    ssrEnv.baseUrl = pluginManifest.base;
    (0, ssrEnv_1.setSsrEnv)(ssrEnv);
    const concurrencyLimit = pLimit(parallel);
    const globalContext = await (0, renderPage_1.getGlobalContext)();
    (0, utils_1.objectAssign)(globalContext, {
        _isPreRendering: true,
        _usesClientRouter: pluginManifest.usesClientRouter,
        prerenderPageContexts: [],
    });
    (0, utils_1.objectAssign)(globalContext, pageContextInit);
    const doNotPrerenderList = [];
    await callPrerenderHooks(globalContext, doNotPrerenderList, concurrencyLimit);
    await handlePagesWithStaticRoutes(globalContext, doNotPrerenderList, concurrencyLimit);
    await callOnBeforePrerenderHook(globalContext);
    const prerenderPageIds = {};
    const htmlFiles = [];
    await routeAndPrerender(globalContext, htmlFiles, prerenderPageIds, concurrencyLimit, noExtraDir);
    warnContradictoryNoPrerenderList(prerenderPageIds, doNotPrerenderList);
    await prerender404Page(htmlFiles, globalContext);
    if (!onPagePrerender) {
        console.log(`${(0, kolorist_1.green)(`✓`)} ${htmlFiles.length} HTML documents pre-rendered.`);
    }
    await Promise.all(htmlFiles.map((htmlFile) => writeHtmlFile(htmlFile, root, outDir, doNotPrerenderList, concurrencyLimit, onPagePrerender)));
    warnMissingPages(prerenderPageIds, doNotPrerenderList, globalContext, partial);
}
exports.prerender = prerender;
async function callPrerenderHooks(globalContext, doNotPrerenderList, concurrencyLimit) {
    // Render URLs returned by `prerender()` hooks
    await Promise.all(globalContext._allPageIds
        .filter((pageId) => !(0, route_1.isErrorPage)(pageId))
        .map((pageId) => concurrencyLimit(async () => {
        const pageFilesData = await (0, renderPage_1.loadPageFiles)(Object.assign(Object.assign({}, globalContext), { _pageId: pageId }));
        const pageServerFile = pageFilesData._pageServerFile;
        if (!pageServerFile)
            return;
        const { fileExports, filePath } = pageServerFile;
        if (fileExports.doNotPrerender) {
            doNotPrerenderList.push({ pageId, pageServerFilePath: filePath });
            return;
        }
        const prerenderFunction = fileExports.prerender;
        if (!prerenderFunction)
            return;
        const prerenderSourceFile = filePath;
        (0, utils_1.assert)(prerenderSourceFile);
        let prerenderResult;
        try {
            prerenderResult = await prerenderFunction();
        }
        catch (err) {
            (0, renderPage_1.throwPrerenderError)(err);
            (0, utils_1.assert)(false);
        }
        const result = normalizePrerenderResult(prerenderResult, prerenderSourceFile);
        result.forEach(({ url, pageContext }) => {
            (0, utils_1.assert)(typeof url === 'string');
            (0, utils_1.assert)(url.startsWith('/'));
            (0, utils_1.assert)(pageContext === null || (0, utils_1.isPlainObject)(pageContext));
            let pageContextFound = globalContext.prerenderPageContexts.find((pageContext) => pageContext.url === url);
            if (!pageContextFound) {
                pageContextFound = Object.assign(Object.assign({}, globalContext), { _prerenderSourceFile: prerenderSourceFile, url });
                globalContext.prerenderPageContexts.push(pageContextFound);
            }
            if (pageContext) {
                (0, utils_1.objectAssign)(pageContextFound, Object.assign({ _pageContextAlreadyProvidedByPrerenderHook: true }, pageContext));
            }
        });
    })));
}
async function handlePagesWithStaticRoutes(globalContext, doNotPrerenderList, concurrencyLimit) {
    // Pre-render pages with a static route
    await Promise.all(globalContext._pageRoutes.map((pageRoute) => concurrencyLimit(async () => {
        const { pageId } = pageRoute;
        if (doNotPrerenderList.find((p) => p.pageId === pageId)) {
            return;
        }
        let url;
        if (pageRoute.pageRouteFile) {
            const { routeValue } = pageRoute.pageRouteFile;
            if (typeof routeValue === 'string' && (0, route_1.isStaticRoute)(routeValue)) {
                (0, utils_1.assert)(routeValue.startsWith('/'));
                url = routeValue;
            }
            else {
                // Abort since the page's route is a Route Function or parameterized Route String
                return;
            }
        }
        else {
            url = pageRoute.filesystemRoute;
        }
        (0, utils_1.assert)(url.startsWith('/'));
        // Already included in a `prerender()` hook
        if (globalContext.prerenderPageContexts.find((pageContext) => pageContext.url === url)) {
            // Not sure if there is a use case for it, but why not allowing users to use a `prerender()` hook in order to provide some `pageContext` for a page with a static route
            return;
        }
        const pageContext = Object.assign(Object.assign({}, globalContext), { _prerenderSourceFile: null, url, routeParams: {}, _pageId: pageId });
        (0, utils_1.objectAssign)(pageContext, await (0, renderPage_1.loadPageFiles)(pageContext));
        globalContext.prerenderPageContexts.push(pageContext);
    })));
}
async function callOnBeforePrerenderHook(globalContext) {
    const hook = await (0, renderPage_1.loadOnBeforePrerenderHook)(globalContext);
    if (!hook) {
        return;
    }
    const { onBeforePrerenderHook, hookFilePath } = hook;
    const result = await onBeforePrerenderHook(globalContext);
    if (result === null || result === undefined) {
        return;
    }
    const errPrefix = `The \`onBeforePrerender()\` hook exported by \`${hookFilePath}\``;
    (0, utils_1.assertUsage)((0, utils_1.isObjectWithKeys)(result, ['globalContext']) && (0, utils_1.hasProp)(result, 'globalContext'), `${errPrefix} should return \`null\`, \`undefined\`, or a plain JavaScript object \`{ globalContext: { /* ... */ } }\`.`);
    const globalContextAddedum = result.globalContext;
    (0, utils_1.assertUsage)((0, utils_1.isPlainObject)(globalContextAddedum), `${errPrefix} returned \`{ globalContext }\` but \`globalContext\` should be a plain JavaScript object.`);
    (0, utils_1.objectAssign)(globalContext, globalContextAddedum);
}
async function routeAndPrerender(globalContext, htmlFiles, prerenderPageIds, concurrencyLimit, noExtraDir) {
    // Route all URLs
    await Promise.all(globalContext.prerenderPageContexts.map((pageContext) => concurrencyLimit(async () => {
        const { url, _prerenderSourceFile: prerenderSourceFile } = pageContext;
        const routeResult = await (0, route_1.route)(pageContext);
        if ('hookError' in routeResult) {
            (0, renderPage_1.throwPrerenderError)(routeResult.hookError);
            (0, utils_1.assert)(false);
        }
        (0, utils_1.assert)((0, utils_1.hasProp)(routeResult.pageContextAddendum, '_pageId', 'null') ||
            (0, utils_1.hasProp)(routeResult.pageContextAddendum, '_pageId', 'string'));
        if (routeResult.pageContextAddendum._pageId === null) {
            // Is this assertion also true with a `onBeforeRoute()` hook?
            (0, utils_1.assert)(prerenderSourceFile);
            (0, utils_1.assertUsage)(false, `Your \`prerender()\` hook defined in \`${prerenderSourceFile}\ returns an URL \`${url}\` that doesn't match any page route. Make sure the URLs your return in your \`prerender()\` hooks always match the URL of a page.`);
        }
        (0, utils_1.assert)(routeResult.pageContextAddendum._pageId);
        (0, utils_1.objectAssign)(pageContext, routeResult.pageContextAddendum);
        const { _pageId: pageId } = pageContext;
        const pageFilesData = await (0, renderPage_1.loadPageFiles)(Object.assign(Object.assign({}, globalContext), { _pageId: pageId }));
        (0, utils_1.objectAssign)(pageContext, pageFilesData);
        const { documentHtml, pageContextSerialized } = await (0, renderPage_1.prerenderPage)(pageContext);
        htmlFiles.push({
            url,
            pageContext,
            htmlString: documentHtml,
            pageContextSerialized,
            doNotCreateExtraDirectory: noExtraDir,
            pageId,
        });
        prerenderPageIds[pageId] = pageContext;
    })));
}
function warnContradictoryNoPrerenderList(prerenderPageIds, doNotPrerenderList) {
    Object.entries(prerenderPageIds).forEach(([pageId, { url, _prerenderSourceFile }]) => {
        const doNotPrerenderListHit = doNotPrerenderList.find((p) => p.pageId === pageId);
        if (doNotPrerenderListHit) {
            (0, utils_1.assert)(_prerenderSourceFile);
            (0, utils_1.assertUsage)(false, `Your \`prerender()\` hook defined in ${_prerenderSourceFile} returns the URL \`${url}\` which matches the page with \`${doNotPrerenderListHit === null || doNotPrerenderListHit === void 0 ? void 0 : doNotPrerenderListHit.pageServerFilePath}#doNotPrerender === true\`. This is contradictory: either do not set \`doNotPrerender\` or remove the URL from the list of URLs to be pre-rendered.`);
        }
    });
}
function warnMissingPages(prerenderPageIds, doNotPrerenderList, globalContext, partial) {
    globalContext._allPageIds
        .filter((pageId) => !prerenderPageIds[pageId])
        .filter((pageId) => !doNotPrerenderList.find((p) => p.pageId === pageId))
        .filter((pageId) => !(0, route_1.isErrorPage)(pageId))
        .forEach((pageId) => {
        (0, utils_1.assertWarning)(partial, `Could not pre-render page \`${pageId}.page.*\` because it has a non-static route, and no \`prerender()\` hook returned (an) URL(s) matching the page's route. Either use a \`prerender()\` hook to pre-render the page, or use the \`--partial\` option to suppress this warning.`);
    });
}
async function prerender404Page(htmlFiles, globalContext) {
    if (!htmlFiles.find(({ url }) => url === '/404')) {
        const result = await (0, renderPage_1.renderStatic404Page)(globalContext);
        if (result) {
            const url = '/404';
            const { documentHtml, pageContext } = result;
            htmlFiles.push({
                url,
                pageContext,
                htmlString: documentHtml,
                pageContextSerialized: null,
                doNotCreateExtraDirectory: true,
                pageId: null,
            });
        }
    }
}
async function writeHtmlFile({ url, pageContext, htmlString, pageContextSerialized, doNotCreateExtraDirectory, pageId }, root, outDir, doNotPrerenderList, concurrencyLimit, onPagePrerender) {
    (0, utils_1.assert)(url.startsWith('/'));
    (0, utils_1.assert)(!doNotPrerenderList.find((p) => p.pageId === pageId));
    const writeJobs = [
        write(url, pageContext, '.html', htmlString, root, outDir, doNotCreateExtraDirectory, concurrencyLimit, onPagePrerender),
    ];
    if (pageContextSerialized !== null) {
        writeJobs.push(write(url, pageContext, '.pageContext.json', pageContextSerialized, root, outDir, doNotCreateExtraDirectory, concurrencyLimit, onPagePrerender));
    }
    await Promise.all(writeJobs);
}
function write(url, pageContext, fileExtension, fileContent, root, outDir, doNotCreateExtraDirectory, concurrencyLimit, onPagePrerender) {
    return concurrencyLimit(async () => {
        const fileUrl = (0, utils_1.getFileUrl)(url, fileExtension, fileExtension === '.pageContext.json' || doNotCreateExtraDirectory);
        (0, utils_1.assert)(fileUrl.startsWith('/'));
        const filePathRelative = fileUrl.slice(1).split('/').join(path_1.sep);
        (0, utils_1.assert)(!filePathRelative.startsWith(path_1.sep));
        const filePath = (0, path_1.join)(root, outDir, 'client', filePathRelative);
        if (onPagePrerender) {
            (0, utils_1.objectAssign)(pageContext, {
                _prerenderResult: {
                    filePath,
                    fileContent,
                },
            });
            await onPagePrerender(pageContext);
        }
        else {
            const { promises } = require('fs');
            const { writeFile, mkdir } = promises;
            await mkdir((0, path_1.dirname)(filePath), { recursive: true });
            await writeFile(filePath, fileContent);
            console.log(`${(0, kolorist_1.gray)((0, path_1.join)(outDir, 'client') + path_1.sep)}${(0, kolorist_1.blue)(filePathRelative)}`);
        }
    });
}
function normalizePrerenderResult(prerenderResult, prerenderSourceFile) {
    if (Array.isArray(prerenderResult)) {
        return prerenderResult.map(normalize);
    }
    else {
        return [normalize(prerenderResult)];
    }
    function normalize(prerenderElement) {
        if (typeof prerenderElement === 'string')
            return { url: prerenderElement, pageContext: null };
        const errMsg1 = `The \`prerender()\` hook defined in \`${prerenderSourceFile}\` returned an invalid value`;
        const errMsg2 = 'Make sure your `prerender()` hook returns an object `{ url, pageContext }` or an array of such objects.';
        (0, utils_1.assertUsage)((0, utils_1.isPlainObject)(prerenderElement), `${errMsg1}. ${errMsg2}`);
        (0, utils_1.assertUsage)((0, utils_1.hasProp)(prerenderElement, 'url'), `${errMsg1}: \`url\` is missing. ${errMsg2}`);
        (0, utils_1.assertUsage)((0, utils_1.hasProp)(prerenderElement, 'url', 'string'), `${errMsg1}: \`url\` should be a string (but we got \`typeof url === "${typeof prerenderElement.url}"\`).`);
        (0, utils_1.assertUsage)(prerenderElement.url.startsWith('/'), `${errMsg1}: the \`url\` with value \`${prerenderElement.url}\` doesn't start with \`/\`. Make sure each URL starts with \`/\`.`);
        Object.keys(prerenderElement).forEach((key) => {
            (0, utils_1.assertUsage)(key === 'url' || key === 'pageContext', `${errMsg1}: unexpected object key \`${key}\` ${errMsg2}`);
        });
        if (!(0, utils_1.hasProp)(prerenderElement, 'pageContext')) {
            prerenderElement['pageContext'] = null;
        }
        (0, utils_1.assertUsage)((0, utils_1.hasProp)(prerenderElement, 'pageContext', 'object'), `The \`prerender()\` hook exported by ${prerenderSourceFile} returned an invalid \`pageContext\` value: make sure \`pageContext\` is a plain JavaScript object.`);
        return prerenderElement;
    }
}
function assertPluginManifest(pluginManifest, pluginManifestPath, outDirPath) {
    (0, utils_1.assertUsage)(pluginManifest, "You are trying to run `$ vite-plugin-ssr prerender` but you didn't build your app yet: make sure to run `$ vite build && vite build --ssr` before running the pre-rendering. (Following build manifest is missing: `" +
        pluginManifestPath +
        '`.)');
    (0, utils_1.assert)(typeof pluginManifest.version === 'string');
    (0, utils_1.assertUsage)(pluginManifest.version === utils_1.projectInfo.projectVersion, `Remove ${outDirPath} and re-build your app \`$ vite build && vite build --ssr && vite-plugin-ssr prerender\`. (You are using \`vite-plugin-ssr@${utils_1.projectInfo.projectVersion}\` but your build has been generated with following different version \`vite-plugin-ssr@${pluginManifest.version}\`.)`);
    (0, utils_1.assert)(typeof pluginManifest.base === 'string');
    (0, utils_1.assert)(typeof pluginManifest.usesClientRouter === 'boolean');
}
function assertArguments({ partial, noExtraDir, base, root, outDir, parallel, }) {
    (0, utils_1.assertUsage)(partial === true || partial === false, '[prerender()] Option `partial` should be a boolean.');
    (0, utils_1.assertUsage)(noExtraDir === true || noExtraDir === false, '[prerender()] Option `noExtraDir` should be a boolean.');
    (0, utils_1.assertWarning)(base === undefined, '[prerender()] Option `base` is deprecated and has no-effect.');
    (0, utils_1.assertUsage)(typeof root === 'string', '[prerender()] Option `root` should be a string.');
    (0, utils_1.assertUsage)((0, path_1.isAbsolute)(root), '[prerender()] The path `root` is not absolute. Make sure to provide an absolute path.');
    (0, utils_1.assertUsage)(typeof outDir === 'string', '[prerender()] Option `outDir` should be a string.');
    (0, utils_1.assertUsage)(parallel, `[prerender()] Option \`parallel\` should be a number \`>=1\` but we got \`${parallel}\`.`);
}
function setProductionEnvVar() {
    // The statement `process.env['NODE_ENV'] = 'production'` chokes webpack v4 (which Cloudflare Workers uses)
    const proc = process;
    const { env } = proc;
    env['NODE_ENV'] = 'production';
}
//# sourceMappingURL=prerender.js.map