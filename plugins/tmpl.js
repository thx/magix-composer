/*
    模板处理总入口
 */
let path = require('path');
let fs = require('fs');
let chalk = require('chalk');
let utils = require('./util');
let fd = require('./util-fd');
let deps = require('./util-deps');
let atpath = require('./util-atpath');
let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let tmplArt = require('./tmpl-art');
let tmplCutsomTag = require('./tmpl-customtag');
let tmplAttr = require('./tmpl-attr');
let tmplStatic = require('./tmpl-static');
let unmatchChecker = require('./checker-tmpl-unmatch');
let checker = require('./checker');
let tmplVars = require('./tmpl-vars');
let md5 = require('./util-md5');
let slog = require('./util-log');
let tmplQuick = require('./tmpl-quick');
let consts = require('./util-const');

let commentReg = /<!--[\s\S]*?-->/g;
let htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
let sep = path.sep;
let removeVdReg = /\u0002/g;
let removeIdReg = /\u0001/g;
let removeAsReg = /\u0010/g;
let stringReg = /\u0017([^\u0017]*?)\u0017/g;
let unsupportCharsReg = /[\u0000-\u0007\u0011-\u0019\u001e\u001f\u0010]/g;
let globalTmplRootReg = /[\u0003\u0006]\./g;
let globalRootReg = /\u0003/g;
let commandAnchorRecover = (tmpl, refTmplCommands) => tmplCmd.recover(tmpl, refTmplCommands)
    .replace(globalTmplRootReg, '')
    .replace(globalRootReg, '$$$$')
    .replace(removeVdReg, '')
    .replace(removeIdReg, '')
    .replace(removeAsReg, '')
    .replace(stringReg, '$1');

let brReg = /(?:\r\n|\r|\n)/;
let brPlaceholder = m => {
    let count = m.split(brReg).length;
    return new Array(count).join('\n');
};
let processTmpl = (fileContent, cache, cssNamesMap, e, reject, lang) => {
    if (!cache[fileContent]) {
        let file = e.srcHTMLFile;
        if (configs.debug && unsupportCharsReg.test(fileContent)) {
            slog.log(chalk.red(`[MXC Error(tmpl)] unsupport character : ${unsupportCharsReg.source}`), 'at', chalk.magenta(e.shortHTMLFile));
            reject(new Error('[MXC Error(tmpl)] unsupport character'));
            return;
        }
        e.templateLang = lang;
        try {
            fileContent = configs.compileTmplStart(fileContent, e);
        } catch (ex) {
            slog.ever(chalk.red('[MXC Error(tmpl)] compile template error ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            ex.message += ' at ' + e.shortHTMLFile;
            reject(ex);
            return;
        }
        fileContent = fileContent.replace(commentReg, brPlaceholder);
        fileContent = tmplQuick.preProcess(fileContent, e);
        fileContent = tmplArt(fileContent, e);
        if (configs.debug) {
            try {
                unmatchChecker(fileContent, e);
            } catch (ex) {
                slog.ever(chalk.red(ex.message), 'at', chalk.magenta(e.shortHTMLFile));
                ex.message += ' at ' + e.shortHTMLFile;
                reject(ex);
                return;
            }
        }
        let srcContent = fileContent;
        try {
            fileContent = tmplCutsomTag.process(fileContent, {
                moduleId: e.moduleId,
                pkgName: e.pkgName,
                srcOwnerHTMLFile: file,
                shortOwnerHTMLFile: e.shortHTMLFile
            }, e);
        } catch (ex) {
            slog.ever(chalk.red('MXC-Error(tmpl) '+ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            ex.message += ' at ' + e.shortHTMLFile;
            reject(ex);
            return;
        }
        //console.log(fileContent);
        if (srcContent != fileContent) {
            fileContent = tmplQuick.preProcess(fileContent, e);
            fileContent = tmplArt(fileContent, e);
        }
        if (configs.debug) {
            try {
                unmatchChecker(fileContent, e);
            } catch (ex) {
                slog.ever(chalk.red(ex.message), 'at', chalk.magenta(e.shortHTMLFile));
                ex.message += ' at ' + e.shortHTMLFile;
                reject(ex);
                return;
            }
        }

        fileContent = fileContent.replace(htmlCommentCelanReg, '').trim();
        fileContent = tmplCmd.compile(fileContent);
        let refTmplCommands = Object.create(null);
        try {
            fileContent = tmplVars.process(fileContent, e);
        } catch (ex) {
            reject(ex);
        }
        fileContent = tmplCmd.store(fileContent, refTmplCommands); //模板命令移除，防止影响分析
        if (!configs.debug) {
            fileContent = fileContent.replace(consts.revisableGReg, m => {
                let src = tmplCmd.recover(m, refTmplCommands);
                checker.Tmpl.checkStringRevisable(m, src, e);
                return md5(m, 'revisableString', configs.revisableStringPrefix);
            });
        }
        fileContent = configs.compileTmplEnd(fileContent);
        fileContent = tmplAttr.process(fileContent, e, refTmplCommands, cssNamesMap);
        try {
            fileContent = tmplCmd.tidy(fileContent);
        } catch (ex) {
            slog.ever(chalk.red('[MXC Error(tmpl)] minify html error : ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile));
            reject(ex);
            return;
        }
        fileContent = tmplStatic(fileContent, e.shortHTMLFile);
        cache[fileContent] = commandAnchorRecover(fileContent, refTmplCommands);
    }
    return cache[fileContent];
};
module.exports = e => {
    return new Promise((resolve, reject) => {
        let cssNamesMap = e.cssNamesMap,
            from = e.from,
            moduleId = e.moduleId,
            fileContentCache = Object.create(null);
        //仍然是读取view.js文件内容，把里面@到的文件内容读取进来
        e.content = e.content.replace(configs.fileTmplReg, (match, quote, ctrl, name, ext) => {
            name = atpath.resolvePath(name, moduleId);
            let file = path.resolve(path.dirname(from) + sep + name + '.' + ext);
            let fileContent = name;
            let singleFile = (name == 'template' && e.contentInfo);
            if (!singleFile) {
                deps.addFileDepend(file, e.from, e.to);
                e.fileDeps[file] = 1;
            } else {
                file = e.from;
            }
            if (singleFile || fs.existsSync(file)) {
                fileContent = singleFile ? e.contentInfo.template : fd.read(file);
                let lang = singleFile ? e.contentInfo.templateLang : ext;
                e.htmlModuleId = utils.extractModuleId(file);
                e.srcHTMLFile = file;
                e.shortHTMLFile = file.replace(configs.moduleIdRemovedPath, '').substring(1);
                if (ext != lang) {
                    slog.ever(chalk.red('[MXC Tip(tmpl)] conflicting template language'), 'at', chalk.magenta(e.shortHTMLFile), 'near', chalk.magenta(match + ' and ' + e.contentInfo.templateTag));
                }
                let html = processTmpl(fileContent, fileContentCache, cssNamesMap, e, reject, lang);
                if (ctrl == 'src') {
                    return JSON.stringify(html);
                }
                let { source, statics } = tmplQuick.process(html, e);
                e.quickStaticVars = statics;
                return source;
            }
            return quote + 'unfound file:' + name + '.' + ext + quote;
        });
        resolve(e);
    });
};