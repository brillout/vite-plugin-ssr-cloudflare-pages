import { getErrorPageId, route, loadPageRoutes, isErrorPage } from '../shared/route';
import { isDocumentHtml, renderHtml, getHtmlString } from './html/renderHtml';
import { getAllPageFiles, findPageFile, findDefaultFiles, findDefaultFile, } from '../shared/getPageFiles';
import { getSsrEnv } from './ssrEnv';
import { stringify } from '@brillout/json-s';
import { assert, assertUsage, isCallable, assertWarning, hasProp, handlePageContextRequestSuffix, isPlainObject, isObject, objectAssign, compareString, assertExports, stringifyStringArray, parseUrl, assertBaseUrl, } from '../shared/utils';
import { getPageAssets } from './html/injectAssets';
import { loadPageIsomorphicFiles, } from '../shared/loadPageIsomorphicFiles';
import { assertUsageServerHooksCalled, getOnBeforeRenderHook, runOnBeforeRenderHooks, } from '../shared/onBeforeRenderHook';
import { sortPageContext } from '../shared/sortPageContext';
import { getStreamReadableNode, getStreamReadableWeb, pipeToStreamWritableWeb, pipeToStreamWritableNode, } from './html/stream';
import { addIs404ToPageProps, serializePageContextClientSide } from './serializePageContextClientSide';
import { addComputedUrlProps } from '../shared/addComputedUrlProps';
import { determinePageIds } from '../shared/determinePageIds';
import { assertPageContextProvidedByUser } from '../shared/assertPageContextProvidedByUser';
export { renderPageWithoutThrowing };
export { prerenderPage };
export { renderStatic404Page };
export { getGlobalContext };
export { loadPageFiles };
export { loadOnBeforePrerenderHook };
export { throwPrerenderError };
async function renderPage(pageContextInit) {
    assertArguments(...arguments);
    const pageContext = await initializePageContext(pageContextInit);
    if ('httpResponse' in pageContext) {
        assert(pageContext.httpResponse === null);
        return pageContext;
    }
    // *** Route ***
    const routeResult = await route(pageContext);
    // TODO: remove unnecessary extra error handling?
    if ('hookError' in routeResult) {
        const err = routeResult.hookError;
        logError(err);
        return await render500Page(pageContextInit, routeResult.hookError);
    }
    objectAssign(pageContext, routeResult.pageContextAddendum);
    // *** Handle 404 ***
    let statusCode;
    if (hasProp(pageContext, '_pageId', 'string')) {
        statusCode = 200;
    }
    else {
        assert(pageContext._pageId === null);
        if (!pageContext._isPageContextRequest) {
            warn404(pageContext);
        }
        const errorPageId = getErrorPageId(pageContext._allPageIds);
        if (!errorPageId) {
            warnMissingErrorPage();
            if (pageContext._isPageContextRequest) {
                const httpResponse = createHttpResponseObject(stringify({
                    pageContext404PageDoesNotExist: true,
                }), {
                    statusCode: 200,
                    renderFilePath: null,
                }, pageContext);
                objectAssign(pageContext, { httpResponse });
                return pageContext;
            }
            else {
                const httpResponse = null;
                objectAssign(pageContext, { httpResponse });
                return pageContext;
            }
        }
        if (!pageContext._isPageContextRequest) {
            statusCode = 404;
        }
        else {
            statusCode = 200;
        }
        objectAssign(pageContext, {
            _pageId: errorPageId,
            is404: true,
        });
    }
    const pageFiles = await loadPageFiles(pageContext);
    objectAssign(pageContext, pageFiles);
    await executeOnBeforeRenderHooks(pageContext);
    if (pageContext._isPageContextRequest) {
        const pageContextSerialized = serializePageContextClientSide(pageContext);
        const httpResponse = createHttpResponseObject(pageContextSerialized, { statusCode: 200, renderFilePath: null }, pageContext);
        objectAssign(pageContext, { httpResponse });
        return pageContext;
    }
    const renderHookResult = await executeRenderHook(pageContext);
    // TODO: remove unnecessary extra error handling?
    if ('hookError' in renderHookResult) {
        const err = renderHookResult.hookError;
        logError(err);
        return await render500Page(pageContextInit, err);
    }
    if (renderHookResult === null) {
        objectAssign(pageContext, { httpResponse: null });
        return pageContext;
    }
    else {
        const { htmlRender, renderFilePath } = renderHookResult;
        const httpResponse = createHttpResponseObject(htmlRender, { statusCode, renderFilePath }, pageContext);
        objectAssign(pageContext, { httpResponse });
        return pageContext;
    }
}
async function initializePageContext(pageContextInit) {
    const pageContext = {
        _isPreRendering: false,
        ...pageContextInit,
    };
    if (pageContext.url.endsWith('/favicon.ico')) {
        objectAssign(pageContext, { httpResponse: null });
        return pageContext;
    }
    const baseUrl = getBaseUrl();
    const { isPageContextRequest, hasBaseUrl } = _parseUrl(pageContext.url, baseUrl);
    if (!hasBaseUrl) {
        objectAssign(pageContext, { httpResponse: null });
        return pageContext;
    }
    objectAssign(pageContext, {
        _isPageContextRequest: isPageContextRequest,
    });
    const globalContext = await getGlobalContext();
    objectAssign(pageContext, globalContext);
    addComputedUrlProps(pageContext);
    return pageContext;
}
// `renderPageWithoutThrowing()` calls `renderPage()` while ensuring an `err` is always `console.error(err)` instead of `throw err`, so that `vite-plugin-ssr` never triggers a server shut down. (Throwing an error in an Express.js middleware shuts down the whole Express.js server.)
async function renderPageWithoutThrowing(pageContextInit) {
    const args = arguments;
    try {
        return await renderPage.apply(null, args);
    }
    catch (err) {
        logError(err);
        try {
            return await render500Page(pageContextInit, err);
        }
        catch (_err2) {
            // We swallow `_err2`; logging `err` should be enough; `_err2` is likely the same error than `err` anyways.
            const pageContext = {};
            objectAssign(pageContext, pageContextInit);
            objectAssign(pageContext, {
                httpResponse: null,
                _err: _err2,
            });
            return pageContext;
        }
    }
}
async function render500Page(pageContextInit, err) {
    assert(hasAlreadyLogged(err));
    const pageContext = await initializePageContext(pageContextInit);
    // `pageContext.httpResponse===null` should have already been handled in `renderPage()`
    assert(!('httpResponse' in pageContext));
    objectAssign(pageContext, {
        is404: false,
        _err: err,
        httpResponse: null,
        routeParams: {},
    });
    if (pageContext._isPageContextRequest) {
        const body = stringify({
            serverSideError: true,
        });
        const httpResponse = createHttpResponseObject(body, { statusCode: 500, renderFilePath: null }, pageContext);
        objectAssign(pageContext, { httpResponse });
        return pageContext;
    }
    const errorPageId = getErrorPageId(pageContext._allPageIds);
    if (errorPageId === null) {
        warnMissingErrorPage();
        return pageContext;
    }
    objectAssign(pageContext, {
        _pageId: errorPageId,
    });
    const pageFiles = await loadPageFiles(pageContext);
    objectAssign(pageContext, pageFiles);
    // We swallow hook errors; another error was already shown to the user in the `logError()` at the beginning of this function; the second error is likely the same than the first error anyways.
    await executeOnBeforeRenderHooks(pageContext);
    /*
    const hookResult = await executeOnBeforeRenderHooks(pageContext)
    if ('hookError' in hookResult) {
      warnCouldNotRender500Page(hookResult)
      return pageContext
    }
    */
    const renderHookResult = await executeRenderHook(pageContext);
    if ('hookError' in renderHookResult) {
        warnCouldNotRender500Page(renderHookResult);
        return pageContext;
    }
    const { htmlRender, renderFilePath } = renderHookResult;
    const httpResponse = createHttpResponseObject(htmlRender, { statusCode: 500, renderFilePath }, pageContext);
    objectAssign(pageContext, { httpResponse });
    return pageContext;
}
function createHttpResponseObject(htmlRender, { statusCode, renderFilePath }, pageContext) {
    if (htmlRender === null) {
        return null;
    }
    assert(!pageContext._isPageContextRequest || typeof htmlRender === 'string');
    return {
        statusCode,
        contentType: pageContext._isPageContextRequest ? 'application/json' : 'text/html',
        get body() {
            if (typeof htmlRender !== 'string') {
                assert(renderFilePath);
                assertUsage(false, '`pageContext.httpResponse.body` is not available because your `render()` hook (' +
                    renderFilePath +
                    ') provides an HTML stream. Use `const body = await pageContext.httpResponse.getBody()` instead, see https://vite-plugin-ssr.com/stream');
            }
            const body = htmlRender;
            return body;
        },
        async getBody() {
            const body = await getHtmlString(htmlRender);
            return body;
        },
        async getNodeStream() {
            assert(htmlRender !== null);
            const nodeStream = await getStreamReadableNode(htmlRender);
            assertUsage(nodeStream !== null, '`pageContext.httpResponse.getNodeStream()` is not available: make sure your `render()` hook provides a Node.js Stream, see https://vite-plugin-ssr.com/stream');
            return nodeStream;
        },
        async getWebStream() {
            assert(htmlRender !== null);
            const webStream = await getStreamReadableWeb(htmlRender);
            assertUsage(webStream !== null, '`pageContext.httpResponse.getWebStream()` is not available: make sure your `render()` hook provides a Web Stream, see https://vite-plugin-ssr.com/stream');
            return webStream;
        },
        pipeToWebWritable(writable) {
            const success = pipeToStreamWritableWeb(htmlRender, writable);
            assertUsage(success, '`pageContext.httpResponse.pipeToWebWritable` is not available: make sure your `render()` hook provides a Web Stream Pipe, see https://vite-plugin-ssr.com/stream');
        },
        pipeToNodeWritable(writable) {
            const success = pipeToStreamWritableNode(htmlRender, writable);
            assertUsage(success, '`pageContext.httpResponse.pipeToNodeWritable` is not available: make sure your `render()` hook provides a Node.js Stream Pipe, see https://vite-plugin-ssr.com/stream');
        },
    };
}
async function prerenderPage(pageContext) {
    assert(pageContext._isPreRendering === true);
    objectAssign(pageContext, {
        _isPageContextRequest: false,
    });
    addComputedUrlProps(pageContext);
    await executeOnBeforeRenderHooks(pageContext);
    const renderHookResult = await executeRenderHook(pageContext);
    if ('hookError' in renderHookResult) {
        throwPrerenderError(renderHookResult.hookError);
        assert(false);
    }
    assertUsage(renderHookResult.htmlRender !== null, "Pre-rendering requires your `render()` hook to provide HTML. Open a GitHub issue if that's a problem for you.");
    assert(pageContext._isPageContextRequest === false);
    const documentHtml = await getHtmlString(renderHookResult.htmlRender);
    assert(typeof documentHtml === 'string');
    if (!pageContext._usesClientRouter) {
        return { documentHtml, pageContextSerialized: null, pageContext };
    }
    else {
        const pageContextSerialized = serializePageContextClientSide(pageContext);
        return { documentHtml, pageContextSerialized, pageContext };
    }
}
async function renderStatic404Page(globalContext) {
    const errorPageId = getErrorPageId(globalContext._allPageIds);
    if (!errorPageId) {
        return null;
    }
    const pageContext = {
        ...globalContext,
        _pageId: errorPageId,
        is404: true,
        routeParams: {},
        url: '/fake-404-url',
        // `renderStatic404Page()` is about generating `dist/client/404.html` for static hosts; there is no Client Routing.
        _usesClientRouter: false,
    };
    const pageFiles = await loadPageFiles(pageContext);
    objectAssign(pageContext, pageFiles);
    return prerenderPage(pageContext);
}
function preparePageContextForRelease(pageContext) {
    assert(typeof pageContext.url === 'string');
    assert(typeof pageContext.urlPathname === 'string');
    assert(isPlainObject(pageContext.urlParsed));
    assert(isPlainObject(pageContext.routeParams));
    assert('Page' in pageContext);
    assert(isObject(pageContext.pageExports));
    sortPageContext(pageContext);
    if (isErrorPage(pageContext._pageId)) {
        assert(hasProp(pageContext, 'is404', 'boolean'));
        addIs404ToPageProps(pageContext);
    }
}
/*/
type PageServerFiles = {
  pageServerFile: PageServerFile | null
  pageServerFileDefault: PageServerFile | null
}
//*/
async function loadPageFiles(pageContext) {
    const { Page, pageExports, pageIsomorphicFile, pageIsomorphicFileDefault } = await loadPageIsomorphicFiles(pageContext);
    const pageClientPath = getPageClientPath(pageContext);
    const { pageServerFile, pageServerFileDefault } = await loadPageServerFiles(pageContext);
    const pageFiles = {
        Page,
        pageExports,
        _pageIsomorphicFile: pageIsomorphicFile,
        _pageIsomorphicFileDefault: pageIsomorphicFileDefault,
        _pageServerFile: pageServerFile,
        _pageServerFileDefault: pageServerFileDefault,
        _pageClientPath: pageClientPath,
    };
    objectAssign(pageFiles, {
        _passToClient: (pageServerFile === null || pageServerFile === void 0 ? void 0 : pageServerFile.fileExports.passToClient) || (pageServerFileDefault === null || pageServerFileDefault === void 0 ? void 0 : pageServerFileDefault.fileExports.passToClient) || [],
    });
    const isPreRendering = pageContext._isPreRendering;
    assert([true, false].includes(isPreRendering));
    const dependencies = [
        pageIsomorphicFile === null || pageIsomorphicFile === void 0 ? void 0 : pageIsomorphicFile.filePath,
        pageIsomorphicFileDefault === null || pageIsomorphicFileDefault === void 0 ? void 0 : pageIsomorphicFileDefault.filePath,
        pageClientPath,
    ].filter((p) => !!p);
    objectAssign(pageFiles, {
        _getPageAssets: async () => {
            const pageAssets = await getPageAssets(pageContext, dependencies, pageClientPath, isPreRendering);
            return pageAssets;
        },
    });
    return pageFiles;
}
function getPageClientPath(pageContext) {
    var _a, _b;
    const { _pageId: pageId, _allPageFiles: allPageFiles } = pageContext;
    const pageClientFiles = allPageFiles['.page.client'];
    assertUsage(pageClientFiles.length > 0, 'No `*.page.client.js` file found. Make sure to create one. You can create a `_default.page.client.js` which will apply as default to all your pages.');
    const pageClientPath = ((_a = findPageFile(pageClientFiles, pageId)) === null || _a === void 0 ? void 0 : _a.filePath) || ((_b = findDefaultFile(pageClientFiles, pageId)) === null || _b === void 0 ? void 0 : _b.filePath);
    assert(pageClientPath);
    return pageClientPath;
}
async function loadPageServerFiles(pageContext) {
    const pageId = pageContext._pageId;
    let serverFiles = pageContext._allPageFiles['.page.server'];
    assertUsage(serverFiles.length > 0, 'No `*.page.server.js` file found. Make sure to create one. You can create a `_default.page.server.js` which will apply as default to all your pages.');
    const [pageServerFile, pageServerFileDefault] = await Promise.all([
        loadPageServerFile(findPageFile(serverFiles, pageId)),
        loadPageServerFile(findDefaultFile(serverFiles, pageId)),
    ]);
    assert(pageServerFile || pageServerFileDefault);
    if (pageServerFile !== null) {
        return { pageServerFile, pageServerFileDefault };
    }
    if (pageServerFileDefault !== null) {
        return { pageServerFile, pageServerFileDefault };
    }
    assert(false);
    async function loadPageServerFile(serverFile) {
        if (serverFile === null) {
            return null;
        }
        const fileExports = await serverFile.loadFile();
        const { filePath } = serverFile;
        assertExportsOfServerPage(fileExports, filePath);
        assert_pageServerFile(fileExports, filePath);
        const onBeforeRenderHook = getOnBeforeRenderHook(fileExports, filePath);
        return { filePath, fileExports, onBeforeRenderHook };
    }
    function assert_pageServerFile(fileExports, filePath) {
        assert(filePath);
        assert(fileExports);
        const render = fileExports['render'];
        assertUsage(!render || isCallable(render), `The \`render()\` hook defined in ${filePath} should be a function.`);
        assertUsage(!('onBeforeRender' in fileExports) || isCallable(fileExports['onBeforeRender']), `The \`onBeforeRender()\` hook defined in ${filePath} should be a function.`);
        assertUsage(!('passToClient' in fileExports) || hasProp(fileExports, 'passToClient', 'string[]'), `The \`passToClient_\` export defined in ${filePath} should be an array of strings.`);
        const prerender = fileExports['prerender'];
        assertUsage(!prerender || isCallable(prerender), `The \`prerender()\` hook defined in ${filePath} should be a function.`);
    }
}
async function loadOnBeforePrerenderHook(globalContext) {
    const defautFiles = findDefaultFiles(globalContext._allPageFiles['.page.server']);
    let onBeforePrerenderHook = null;
    let hookFilePath = undefined;
    await Promise.all(defautFiles.map(async ({ filePath, loadFile }) => {
        const fileExports = await loadFile();
        assertExportsOfServerPage(fileExports, filePath);
        if ('onBeforePrerender' in fileExports) {
            assertUsage(hasProp(fileExports, 'onBeforePrerender', 'function'), `The \`export { onBeforePrerender }\` in ${filePath} should be a function.`);
            assertUsage(onBeforePrerenderHook === null, 'There can be only one `onBeforePrerender()` hook. If you need to be able to define several, open a new GitHub issue.');
            onBeforePrerenderHook = fileExports.onBeforePrerender;
            hookFilePath = filePath;
        }
    }));
    if (!onBeforePrerenderHook) {
        return null;
    }
    assert(hookFilePath);
    return { onBeforePrerenderHook, hookFilePath };
}
function assertExportsOfServerPage(fileExports, filePath) {
    assertExports(fileExports, filePath, ['render', 'onBeforeRender', 'passToClient', 'prerender', 'doNotPrerender', 'onBeforePrerender'], {
        ['_onBeforePrerender']: 'onBeforePrerender',
    }, {
        ['addPageContext']: 'onBeforeRender',
    });
}
async function executeOnBeforeRenderHooks(pageContext) {
    var _a, _b, _c, _d;
    if (pageContext._pageContextAlreadyProvidedByPrerenderHook) {
        return;
    }
    let serverHooksCalled = false;
    let skipServerHooks = false;
    if (isomorphicHooksExist() && !pageContext._isPageContextRequest) {
        const pageContextAddendum = await runOnBeforeRenderHooks(pageContext._pageIsomorphicFile, pageContext._pageIsomorphicFileDefault, {
            ...pageContext,
            skipOnBeforeRenderServerHooks,
            runOnBeforeRenderServerHooks,
        });
        Object.assign(pageContext, pageContextAddendum);
        assertUsageServerHooksCalled({
            hooksServer: [
                ((_a = pageContext._pageServerFile) === null || _a === void 0 ? void 0 : _a.onBeforeRenderHook) && pageContext._pageServerFile.filePath,
                ((_b = pageContext._pageServerFileDefault) === null || _b === void 0 ? void 0 : _b.onBeforeRenderHook) && pageContext._pageServerFileDefault.filePath,
            ],
            hooksIsomorphic: [
                ((_c = pageContext._pageIsomorphicFile) === null || _c === void 0 ? void 0 : _c.onBeforeRenderHook) && pageContext._pageIsomorphicFile.filePath,
                ((_d = pageContext._pageIsomorphicFileDefault) === null || _d === void 0 ? void 0 : _d.onBeforeRenderHook) && pageContext._pageIsomorphicFileDefault.filePath,
            ],
            serverHooksCalled,
            _pageId: pageContext._pageId,
        });
    }
    else {
        const { pageContext: pageContextAddendum } = await runOnBeforeRenderServerHooks();
        Object.assign(pageContext, pageContextAddendum);
    }
    return undefined;
    function isomorphicHooksExist() {
        var _a, _b;
        return (!!((_a = pageContext._pageIsomorphicFile) === null || _a === void 0 ? void 0 : _a.onBeforeRenderHook) ||
            !!((_b = pageContext._pageIsomorphicFileDefault) === null || _b === void 0 ? void 0 : _b.onBeforeRenderHook));
    }
    async function skipOnBeforeRenderServerHooks() {
        assertUsage(serverHooksCalled === false, 'You cannot call `pageContext.skipOnBeforeRenderServerHooks()` after having called `pageContext.runOnBeforeRenderServerHooks()`.');
        skipServerHooks = true;
    }
    async function runOnBeforeRenderServerHooks() {
        assertUsage(skipServerHooks === false, 'You cannot call `pageContext.runOnBeforeRenderServerHooks()` after having called `pageContext.skipOnBeforeRenderServerHooks()`.');
        assertUsage(serverHooksCalled === false, 'You already called `pageContext.runOnBeforeRenderServerHooks()`; you cannot call it a second time.');
        serverHooksCalled = true;
        const pageContextAddendum = await runOnBeforeRenderHooks(pageContext._pageServerFile, pageContext._pageServerFileDefault, pageContext);
        return { pageContext: pageContextAddendum };
    }
}
async function executeRenderHook(pageContext) {
    assert(pageContext._pageServerFile || pageContext._pageServerFileDefault);
    let render;
    let renderFilePath;
    const pageServerFile = pageContext._pageServerFile;
    const pageRenderFunction = pageServerFile === null || pageServerFile === void 0 ? void 0 : pageServerFile.fileExports.render;
    if (pageServerFile && pageRenderFunction) {
        render = pageRenderFunction;
        renderFilePath = pageServerFile.filePath;
    }
    else {
        const pageServerFileDefault = pageContext._pageServerFileDefault;
        const pageDefaultRenderFunction = pageServerFileDefault === null || pageServerFileDefault === void 0 ? void 0 : pageServerFileDefault.fileExports.render;
        if (pageServerFileDefault && pageDefaultRenderFunction) {
            render = pageDefaultRenderFunction;
            renderFilePath = pageServerFileDefault.filePath;
        }
    }
    assertUsage(render, 'No `render()` hook found. Make sure to define a `*.page.server.js` file with `export function render() { /*...*/ }`. You can also `export { render }` in `_default.page.server.js` which will be the default `render()` hook of all your pages.');
    assert(renderFilePath);
    preparePageContextForRelease(pageContext);
    const hookName = 'render';
    let result;
    try {
        // We use a try-catch because the `render()` hook is user-defined and may throw an error.
        result = await render(pageContext);
    }
    catch (hookError) {
        return { hookError, hookName, hookFilePath: renderFilePath };
    }
    if (isObject(result) && !isDocumentHtml(result)) {
        assertHookResult(result, hookName, ['documentHtml', 'pageContext'], renderFilePath);
    }
    if (hasProp(result, 'pageContext')) {
        const pageContextProvidedByUser = result.pageContext;
        assertPageContextProvidedByUser(pageContextProvidedByUser, { hookFilePath: renderFilePath, hookName });
        Object.assign(pageContext, pageContextProvidedByUser);
    }
    const errPrefix = 'The `render()` hook exported by ' + renderFilePath;
    const errSuffix = [
        "a string generated with the `escapeInject` template tag or a string returned by `dangerouslySkipEscape('<p>Some HTML</p>')`",
        ', see https://vite-plugin-ssr.com/escapeInject',
    ].join(' ');
    let documentHtml;
    if (!isObject(result) || isDocumentHtml(result)) {
        assertUsage(typeof result !== 'string', [
            errPrefix,
            'returned a plain JavaScript string which is forbidden;',
            'instead, it should return',
            errSuffix,
        ].join(' '));
        assertUsage(result === null || isDocumentHtml(result), [
            errPrefix,
            'should return `null`, a string `documentHtml`, or an object `{ documentHtml, pageContext }`',
            'where `pageContext` is `undefined` or an object holding additional `pageContext` values',
            'and `documentHtml` is',
            errSuffix,
        ].join(' '));
        documentHtml = result;
    }
    else {
        assertKeys(result, ['documentHtml', 'pageContext'], errPrefix);
        if ('documentHtml' in result) {
            documentHtml = result.documentHtml;
            assertUsage(typeof documentHtml !== 'string', [
                errPrefix,
                'returned `{ documentHtml }`, but `documentHtml` is a plain JavaScript string which is forbidden;',
                '`documentHtml` should be',
                errSuffix,
            ].join(' '));
            assertUsage(documentHtml === undefined || documentHtml === null || isDocumentHtml(documentHtml), [errPrefix, 'returned `{ documentHtml }`, but `documentHtml` should be', errSuffix].join(' '));
        }
    }
    assert(documentHtml === undefined || documentHtml === null || isDocumentHtml(documentHtml));
    if (documentHtml === null || documentHtml === undefined) {
        return { htmlRender: null, renderFilePath };
    }
    const onErrorWhileStreaming = (err) => {
        objectAssign(pageContext, {
            _err: err,
            _serverSideErrorWhileStreaming: true,
        });
        logError(err);
    };
    const htmlRender = await renderHtml(documentHtml, pageContext, renderFilePath, onErrorWhileStreaming);
    if (hasProp(htmlRender, 'hookError')) {
        return { hookError: htmlRender.hookError, hookName, hookFilePath: renderFilePath };
    }
    return { htmlRender, renderFilePath };
}
function assertHookResult(hookResult, hookName, hookResultKeys, hookFile) {
    const errPrefix = `The \`${hookName}()\` hook exported by ${hookFile}`;
    assertUsage(hookResult === null || hookResult === undefined || isPlainObject(hookResult), `${errPrefix} should return \`null\`, \`undefined\`, or a plain JavaScript object.`);
    if (hookResult === undefined || hookResult === null) {
        return;
    }
    assertKeys(hookResult, hookResultKeys, errPrefix);
}
function assertKeys(obj, keysExpected, errPrefix) {
    const keysUnknown = [];
    const keys = Object.keys(obj);
    for (const key of keys) {
        if (!keysExpected.includes(key)) {
            keysUnknown.push(key);
        }
    }
    assertUsage(keysUnknown.length === 0, [
        errPrefix,
        'returned an object with unknown keys',
        stringifyStringArray(keysUnknown) + '.',
        'Only following keys are allowed:',
        stringifyStringArray(keysExpected) + '.',
    ].join(' '));
}
function assertArguments(...args) {
    const pageContext = args[0];
    assertUsage(pageContext, '`renderPage(pageContext)`: argument `pageContext` is missing.');
    assertUsage(isPlainObject(pageContext), `\`renderPage(pageContext)\`: argument \`pageContext\` should be a plain JavaScript object, but you passed a \`pageContext\` with \`pageContext.constructor === ${pageContext.constructor}\`.`);
    assertUsage(hasProp(pageContext, 'url'), '`renderPage(pageContext)`: The `pageContext` you passed is missing the property `pageContext.url`.');
    assertUsage(typeof pageContext.url === 'string', '`renderPage(pageContext)`: `pageContext.url` should be a string but `typeof pageContext.url === "' +
        typeof pageContext.url +
        '"`.');
    assertUsage(pageContext.url.startsWith('/') || pageContext.url.startsWith('http'), '`renderPage(pageContext)`: `pageContext.url` should start with `/` (e.g. `/product/42`) or `http` (e.g. `http://example.org/product/42`) but `pageContext.url === "' +
        pageContext.url +
        '"`.');
    try {
        const { url } = pageContext;
        const urlWithOrigin = url.startsWith('http') ? url : 'http://fake-origin.example.org' + url;
        // `new URL()` conveniently throws if URL is not an URL
        new URL(urlWithOrigin);
    }
    catch (err) {
        assertUsage(false, '`renderPage(pageContext)`: `pageContext.url` should be a URL but `pageContext.url==="' + pageContext.url + '"`.');
    }
    const len = args.length;
    assertUsage(len === 1, `\`renderPage(pageContext)\`: You passed ${len} arguments but \`renderPage()\` accepts only one argument.'`);
}
function warnMissingErrorPage() {
    const { isProduction } = getSsrEnv();
    if (!isProduction) {
        assertWarning(false, 'No `_error.page.js` found. We recommend creating a `_error.page.js` file. (This warning is not shown in production.)');
    }
}
function warnCouldNotRender500Page({ hookFilePath, hookName }) {
    assert(!hookName.endsWith('()'));
    assertWarning(false, `The error page \`_error.page.js\` could be not rendered because your \`${hookName}()\` hook exported by ${hookFilePath} threw an error.`);
}
function warn404(pageContext) {
    const { isProduction } = getSsrEnv();
    const pageRoutes = pageContext._pageRoutes;
    assertUsage(pageRoutes.length > 0, 'No page found. Create a file that ends with the suffix `.page.js` (or `.page.vue`, `.page.jsx`, ...).');
    const { urlPathname } = pageContext;
    if (!isProduction && !isFileRequest(urlPathname)) {
        assertWarning(false, [
            `URL \`${urlPathname}\` is not matching any of your ${pageRoutes.length} page routes (this warning is not shown in production):`,
            ...getPagesAndRoutesInfo(pageRoutes),
        ].join('\n'));
    }
}
function getPagesAndRoutesInfo(pageRoutes) {
    return pageRoutes
        .map((pageRoute) => {
        const { pageId, filesystemRoute, pageRouteFile } = pageRoute;
        let route;
        let routeType;
        if (pageRouteFile) {
            const { routeValue } = pageRouteFile;
            route =
                typeof routeValue === 'string'
                    ? routeValue
                    : truncateString(String(routeValue).split(/\s/).filter(Boolean).join(' '), 64);
            routeType = typeof routeValue === 'string' ? 'Route String' : 'Route Function';
        }
        else {
            route = filesystemRoute;
            routeType = 'Filesystem Route';
        }
        return `\`${route}\` (${routeType} of \`${pageId}.page.*\`)`;
    })
        .sort(compareString)
        .map((line, i) => {
        const nth = (i + 1).toString().padStart(pageRoutes.length.toString().length, '0');
        return ` (${nth}) ${line}`;
    });
}
function truncateString(str, len) {
    if (len > str.length) {
        return str;
    }
    else {
        str = str.substring(0, len);
        return str + '...';
    }
}
function isFileRequest(urlPathname) {
    assert(urlPathname.startsWith('/'));
    const paths = urlPathname.split('/');
    const lastPath = paths[paths.length - 1];
    assert(typeof lastPath === 'string');
    const parts = lastPath.split('.');
    if (parts.length < 2) {
        return false;
    }
    const fileExtension = parts[parts.length - 1];
    assert(typeof fileExtension === 'string');
    return /^[a-z0-9]+$/.test(fileExtension);
}
function _parseUrl(url, baseUrl) {
    assert(url.startsWith('/') || url.startsWith('http'));
    assert(baseUrl.startsWith('/'));
    const { urlWithoutPageContextRequestSuffix, isPageContextRequest } = handlePageContextRequestSuffix(url);
    return { ...parseUrl(urlWithoutPageContextRequestSuffix, baseUrl), isPageContextRequest };
}
async function getGlobalContext() {
    const globalContext = {
        _parseUrl,
        _baseUrl: getBaseUrl(),
    };
    assertBaseUrl(globalContext._baseUrl);
    const allPageFiles = await getAllPageFiles();
    objectAssign(globalContext, {
        _allPageFiles: allPageFiles,
    });
    const allPageIds = await determinePageIds(allPageFiles);
    objectAssign(globalContext, { _allPageIds: allPageIds });
    const { pageRoutes, onBeforeRouteHook } = await loadPageRoutes(globalContext);
    objectAssign(globalContext, { _pageRoutes: pageRoutes, _onBeforeRouteHook: onBeforeRouteHook });
    return globalContext;
}
function throwPrerenderError(err) {
    // `err` originates from a user hook throwing; Vite is out of the equation here.
    assert(viteAlreadyLoggedError(err) === false);
    viteErrorCleanup(err);
    if (hasProp(err, 'stack')) {
        throw err;
    }
    else {
        throw new Error(err);
    }
}
function logError(err) {
    if (viteAlreadyLoggedError(err)) {
        return;
    }
    assertUsage(isObject(err), 'Your source code threw a primitive value as error (this should never happen). Contact the `vite-plugin-ssr` maintainer to get help.');
    // Avoid logging error twice (not sure if this actually ever happens?)
    if (hasAlreadyLogged(err)) {
        return;
    }
    viteErrorCleanup(err);
    // We ensure we print a string; Cloudflare Workers doesn't seem to properly stringify `Error` objects.
    const errStr = (hasProp(err, 'stack') && String(err.stack)) || String(err);
    console.error(errStr);
}
function viteAlreadyLoggedError(err) {
    const { viteDevServer, isProduction } = getSsrEnv();
    if (isProduction) {
        return false;
    }
    if (viteDevServer && viteDevServer.config.logger.hasErrorLogged(err)) {
        return true;
    }
    return false;
}
function hasAlreadyLogged(err) {
    assert(isObject(err));
    const key = '_wasAlreadyConsoleLogged';
    if (err[key]) {
        return true;
    }
    err[key] = true;
    return false;
}
function viteErrorCleanup(err) {
    const { viteDevServer } = getSsrEnv();
    if (viteDevServer) {
        if (hasProp(err, 'stack')) {
            // Apply source maps
            viteDevServer.ssrFixStacktrace(err);
        }
    }
}
function getBaseUrl() {
    const { baseUrl } = getSsrEnv();
    return baseUrl;
}
//# sourceMappingURL=renderPage.js.map