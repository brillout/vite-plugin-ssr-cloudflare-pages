"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPlainObject = void 0;
function isPlainObject(value) {
    return (typeof value === 'object' &&
        value !== null &&
        /* Doesn't work in Cloudlfare Pages workers
        value.constructor.name === Object
        */
        value.constructor.name === 'Object');
}
exports.isPlainObject = isPlainObject;
//# sourceMappingURL=isPlainObject.js.map