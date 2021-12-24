import { assert, parseUrl, objectAssign, isCallable } from './utils';
export { addComputedUrlProps };
function addComputedUrlProps(pageContext) {
    var _a, _b;
    if ('urlPathname' in pageContext) {
        assert(((_a = Object.getOwnPropertyDescriptor(pageContext, 'urlPathname')) === null || _a === void 0 ? void 0 : _a.get) === urlPathnameGetter);
        assert(((_b = Object.getOwnPropertyDescriptor(pageContext, 'urlParsed')) === null || _b === void 0 ? void 0 : _b.get) === urlParsedGetter);
    }
    else {
        Object.defineProperty(pageContext, 'urlPathname', {
            get: urlPathnameGetter,
            enumerable: true,
            configurable: true,
        });
        Object.defineProperty(pageContext, 'urlParsed', {
            get: urlParsedGetter,
            enumerable: true,
            configurable: true,
        });
    }
}
function getUrlParsed(pageContext) {
    const { url, _baseUrl: baseUrl, _parseUrl } = pageContext;
    assert(baseUrl.startsWith('/'));
    assert(_parseUrl === null || isCallable(pageContext._parseUrl));
    if (_parseUrl === null) {
        return parseUrl(url, baseUrl);
    }
    else {
        return _parseUrl(url, baseUrl);
    }
}
function urlPathnameGetter() {
    const { pathnameWithoutBaseUrl } = getUrlParsed(this);
    const urlPathname = pathnameWithoutBaseUrl;
    assert(urlPathname.startsWith('/'));
    return urlPathname;
}
function urlParsedGetter() {
    const urlParsedOriginal = getUrlParsed(this);
    const pathname = urlParsedOriginal.pathnameWithoutBaseUrl;
    const urlParsed = urlParsedOriginal;
    delete urlParsed.pathnameWithoutBaseUrl;
    objectAssign(urlParsed, { pathname });
    assert(urlParsed.pathname.startsWith('/'));
    assert(!('pathnameWithoutBaseUrl' in urlParsed));
    return urlParsed;
}
//# sourceMappingURL=addComputedUrlProps.js.map