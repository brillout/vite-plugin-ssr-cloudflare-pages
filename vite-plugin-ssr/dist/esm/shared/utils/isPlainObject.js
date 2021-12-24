export { isPlainObject };
function isPlainObject(value) {
    return (typeof value === 'object' &&
        value !== null &&
        /* Doesn't work in Cloudlfare Pages workers
        value.constructor.name === Object
        */
        value.constructor.name === 'Object');
}
//# sourceMappingURL=isPlainObject.js.map