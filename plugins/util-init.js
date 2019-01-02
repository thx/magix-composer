/*
    初始化各种文件夹的配置项，相对转成完整的物理路径，方便后续的使用处理
 */
let path = require('path');
let configs = require('./util-config');
let globReg = require('./util-globreg');
let crypto = require('crypto');
let reservedReplacer = {
    top: 1,
    bottom: 1,
    src: 1,
    global: 1,
    ref: 1,
    names: 1,
    str: 1,
    base64: 1
};
module.exports = () => {
    if (!configs.$inited) {
        configs.$inited = 1;
        configs.commonFolder = path.resolve(configs.commonFolder);
        configs.compiledFolder = path.resolve(configs.compiledFolder);
        configs.jsFileExtNamesReg = new RegExp('\\.(?:' + configs.jsFileExtNames.join('|') + ')$');
        configs.moduleIdRemovedPath = configs.commonFolder; //把路径中开始到模板目录移除就基本上是模块路径了
        if (configs.projectName === null) {
            let str = crypto.createHash('sha512')
                .update(configs.commonFolder, 'ascii')
                .digest('hex');
            configs.projectName = 'x' + str.substring(0, 2);
        }

        let tmplExtNames = configs.tmplFileExtNames;

        let names = tmplExtNames.slice();
        if (names.indexOf('mx') == -1) {
            names.push('mx');
        }
        configs.tmplFileExtNamesReg = new RegExp('\\.(?:' + names.join('|') + ')$');

        configs.htmlFileReg = new RegExp('(?:src)?@[^\'"\\s@]+\\.(?:' + tmplExtNames.join('|') + ')');
        configs.htmlFileGlobalReg = new RegExp(configs.htmlFileReg, 'g');

        //模板处理，即处理view.html文件
        configs.fileTmplReg = new RegExp('([\'"`])(src)?\\u0012@([^\'"\\s@]+)\\.(' + tmplExtNames.join('|') + ')\\1', 'g');

        configs.tmplMxEventReg = /\b(?:\x1c\d+\x1c)?mx-(?!view|vframe|owner|autonomy|datafrom|guid|ssid|dep|html|static|is|as|type|name|from|to|slot-view|static-attr)([a-zA-Z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

        let rsPrefix = configs.revisableStringPrefix;
        if (!rsPrefix) {
            rsPrefix = '__';
        } else if (rsPrefix.charAt(0) === '$') {//以$开头是开发者手动处理的
            rsPrefix = '_' + rsPrefix;
        }
        configs.revisableStringPrefix = rsPrefix;

        let galleryPrefixes = Object.create(null);
        for (let p in configs.galleries) {
            if (p.endsWith('Root')) {
                galleryPrefixes[p.slice(0, -4)] = 1;
            } else if (p.endsWith('Map')) {
                galleryPrefixes[p.slice(0, -3)] = 1;
            }
        }
        configs.galleryPrefixes = galleryPrefixes;

        configs.selectorKeepNameReg = /(--)[\w-]+$/;
        configs.selectorDSEndReg = /--$/;

        configs.galleriesDynamicRequires = Object.create(null);
        configs.excludesReg = [];
        for (let ex of configs.excludes) {
            configs.excludesReg.push(globReg(ex));
        }
        let replacer = configs.fileReplacerPrefixes;
        for (let r of replacer) {
            if (reservedReplacer[r] === 1) {
                throw new Error('MXC-Error(util-init) reserved:' + r);
            }
        }
        replacer.push('str', 'base64');
        configs.fileReplacerPrefixesReg = new RegExp(`(?:${replacer.join('|')})@[\\w\\.\\-\\/\\\\]+`);
        configs.fileReplacerPrefixesHolderReg = new RegExp(`([\`"'])(${replacer.join('|')})\\x12@([\\w\\.\\-\\/\\\\]+)\\1`);
    }
};