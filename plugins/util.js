/*
    抽取模块id,如文件物理路径为'/users/xiglie/afp/tmpl/app/views/default.js'
    则抽取出来的模块id是 app/vies/default
 */

let path = require('path');
let sutil = require('util');
let configs = require('./util-config');
let fcache = require('./util-fcache');

let sep = path.sep;
let sepRegTmpl = sep.replace(/\\/g, '\\\\');
let sepReg = new RegExp(sepRegTmpl, 'g');
let startSlashReg = /^\//;
let moduleIdCache = Object.create(null);
let extractModuleId = (file, ignoreVirtual) => {
    let key = file + '\x00' + ignoreVirtual;
    if (moduleIdCache[key]) {
        return moduleIdCache[key];
    }
    let id = file.replace(configs.moduleIdRemovedPath, '')
        .replace(configs.jsOrCssFileExtNamesReg, '')
        .replace(sepReg, '/')
        .replace(startSlashReg, '');
    //console.log(file, ignoreVirtual);
    if (!ignoreVirtual &&
        configs.moduleAddVirtualRootToId &&
        !id.startsWith('~')) {
        id = `~${configs.projectName}/${id}`;
    }
    moduleIdCache[key] = id;
    return id;
};

let clone = object => {
    if (sutil.isArray(object)) {
        let ta = [];
        for (let i = 0; i < object.length; i++) {
            ta[i] = clone(object[i]);
        }
        return ta;
    } else if (sutil.isObject(object)) {
        let temp = Object.create(null);
        for (let p in object) {
            temp[p] = clone(object[p]);
        }
        return temp;
    }
    return object;
};
let cloneAssign = (dest, src) => {
    Object.assign(dest, clone(src));
};
let uId = (fix, str, withoutSuffix) => {
    let id;
    do {
        id = Math.random().toString(36).replace(/[\d\.]/g, '');
    } while (~str.indexOf(id));
    return (fix || '') + id + (withoutSuffix ? '' : (fix || ''));
};
/**
 * Camelize a hyphen-delimited string.
 */
let camelizeRE = /-(\w)/g;
let camelize = fcache(str => {
    return str.replace(camelizeRE, (_, c) => {
        return c ? c.toUpperCase() : '';
    });
});

/**
 * Hyphenate a camelCase string.
 */
let hyphenateRE = /(?=[^-])([A-Z])/g;
let hyphenate = fcache(str => {
    return str
        .replace(hyphenateRE, '-$1')
        .toLowerCase();
});
module.exports = {
    clone,
    uId,
    cloneAssign,
    extractModuleId,
    hyphenate,
    camelize
};