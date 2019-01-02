/*
    样式处理入口
    读取js代码中的样式占位规则，把占位规则处理成真实的内容
 */
let cssnano = require('cssnano');
let path = require('path');
let configs = require('./util-config');
let atpath = require('./util-atpath');
let cssAtRule = require('./css-atrule');
let cssFileRead = require('./css-read');
let deps = require('./util-deps');
let checker = require('./checker');
let cssGlobal = require('./css-global');
let cssComment = require('./css-comment');
let utils = require('./util');
let cloneAssign = utils.cloneAssign;
let {
    cssNameNewProcessor,
    cssNameGlobalProcessor,
    genCssNamesKey,
    cssRefReg,
    refProcessor
} = require('./css-selector');
//处理css文件
//另外一个思路是：解析出js中的字符串，然后在字符串中做替换就会更保险，目前先不这样做。
//https://github.com/Automattic/xgettext-js
//处理js文件中如 'global@x.less' '@x.less:selector' 'ref@../x.scss' 等各种情况
//"abc(@style.css:xx)yyzz"
//[ref="@../default.css:inmain"] .open{
//    color:red
//}
let cssTmplReg = /(\()?\s*(['"]?)\(?(global|ref|names)?\x12@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.sass|\.mx|\.mmx|\.style)(?::?\[([\w-,]+)\]|:\.?([\w\-]+))?\)?\2\s*(\))?(;?)/g;
let sep = path.sep;


module.exports = (e, inwatch) => {
    if (inwatch) {
        checker.CSS.clearUsed(e.from);
        checker.CSS.clearUsedTags(e.from);
    }
    let cssNamesMap = Object.create(null);
    let cssNamesToFiles = Object.create(null);
    let cssNamesKey;
    let addToGlobalCSS = true;

    let gCSSNamesMap = Object.create(null);
    let gCSSNamesToFiles = Object.create(null);
    let currentFile = '';
    let cssContentCache = Object.create(null);
    let gCSSTagToFiles = Object.create(null);
    let sRefAtRules = Object.create(null);

    return cssGlobal.process({
        context: e,
        inwatch: inwatch
    }).then(gInfo => {
        //console.log(e.cssNamesInFiles);
        //console.log('global', gCSSNamesMap);
        return new Promise((resolve, reject) => {
            cloneAssign(gCSSNamesMap, gInfo.globalCssNamesMap);
            cloneAssign(gCSSNamesToFiles, gInfo.globalCssNamesInFiles);
            cloneAssign(gCSSTagToFiles, gInfo.globalCssTagsInFiles);
            cloneAssign(sRefAtRules, gInfo.scopedRefAtRules);
            e.cssNamesMap = gCSSNamesMap;
            e.cssNamesInFiles = gCSSNamesToFiles;
            e.cssTagsInFiles = gCSSTagToFiles;
            cssTmplReg.lastIndex = 0;
            if (cssTmplReg.test(e.content)) { //有需要处理的@规则
                cssTmplReg.lastIndex = 0;
                let count = 0;
                let tempMatchToFile = Object.create(null);
                let folder = path.dirname(e.from);
                let cmtStores = Object.create(null);
                let resume = () => {
                    e.content = e.content.replace(cssTmplReg, (m, left, q, prefix, name, ext, keys, key, right, tail) => {
                        let info = tempMatchToFile[m];
                        let { file,
                            scopedStyle,
                            shortCssFile,
                            globalStyle,
                            markUsedFiles } = info;
                        let fileName = path.basename(file);
                        let r = cssContentCache[file];
                        //从缓存中获取当前文件的信息
                        //如果不存在就返回一个不存在的提示
                        if (!r.exists) {
                            if (q) {
                                m = m.slice(1, -1);
                            }
                            checker.CSS.markUnexists(m, e.from);
                            return ['\'$throw_' + name + ext + '\'', q + 'unfound:' + name + ext + q];
                        }
                        let fileContent = r.css;
                        let store = cmtStores[file];
                        if (store) {
                            fileContent = cssComment.recover(fileContent, store);
                        }
                        cssNamesKey = genCssNamesKey(file);
                        if (scopedStyle || globalStyle) {
                            cssNamesMap = gCSSNamesMap;
                        } else {
                            cssNamesMap = Object.create(null);
                            cssNamesToFiles = Object.create(null);
                            currentFile = file;
                            let cssTagsToFiles = Object.create(null);
                            let cssTagsMap = Object.create(null);
                            if (prefix != 'global') { //如果不是项目中全局使用的
                                addToGlobalCSS = prefix != 'names'; //不是读取css名称对象的
                                if (keys || key) { //有后缀时也不添加到全局
                                    addToGlobalCSS = false;
                                }
                                if (!r.cssNames) {
                                    fileContent = fileContent.replace(cssRefReg, (m, q, f, ext, selector) => {
                                        let s = refProcessor(file, f, ext, selector, gInfo);
                                        sRefAtRules[s] = m;
                                        return s;
                                    });
                                    try {
                                        fileContent = cssNameNewProcessor(fileContent, {
                                            refAtRules: sRefAtRules,
                                            shortFile: shortCssFile,
                                            namesMap: gCSSNamesMap,
                                            globalReservedMap: gInfo.globalReservedMap,
                                            namesToFiles: gCSSNamesToFiles,
                                            namesKey: cssNamesKey,
                                            cNamesMap: cssNamesMap,
                                            cNamesToFiles: cssNamesToFiles,
                                            addToGlobalCSS: addToGlobalCSS,
                                            file: currentFile,
                                            fileTags: cssTagsMap,
                                            tagsToFiles: cssTagsToFiles
                                        });
                                    } catch (ex) {
                                        reject(ex);
                                    }
                                    //@规则处理
                                    fileContent = cssAtRule(fileContent, cssNamesKey, false, gInfo);
                                    //if (addToGlobalCSS) {
                                    r.cssNames = cssNamesMap;
                                    r.fileContent = fileContent;
                                    r.namesToFiles = cssNamesToFiles;
                                    r.tagsToFiles = cssTagsToFiles;
                                    r.cssTags = cssTagsMap;
                                    cloneAssign(gCSSTagToFiles, cssTagsToFiles);
                                    checker.CSS.fileToTags(file, cssTagsMap, inwatch);
                                    checker.CSS.fileToSelectors(file, cssNamesMap, inwatch);
                                    //}
                                } else {
                                    cssNamesMap = r.cssNames;
                                    cssNamesToFiles = r.namesToFiles;
                                    cssTagsToFiles = r.tagsToFiles;
                                    fileContent = r.fileContent;
                                    if (addToGlobalCSS) {
                                        cloneAssign(gCSSNamesMap, cssNamesMap);
                                        cloneAssign(gCSSNamesToFiles, cssNamesToFiles);
                                        cloneAssign(gCSSTagToFiles, cssTagsToFiles);
                                    }
                                }
                            } else {
                                //global
                                let globals = configs.globalCss;
                                let unchecked = configs.uncheckGlobalCss;
                                if (globals.indexOf(file) == -1) {
                                    if (unchecked.indexOf(file) == -1) {
                                        fileContent = fileContent.replace(cssRefReg, (m, q, f, ext, selector) => {
                                            let s = refProcessor(file, f, ext, selector, gInfo);
                                            sRefAtRules[s] = m;
                                            return s;
                                        });
                                        try {
                                            cssNameGlobalProcessor(fileContent, {
                                                refAtRules: sRefAtRules,
                                                shortFile: shortCssFile,
                                                namesMap: gCSSNamesMap,
                                                namesToFiles: gCSSNamesToFiles,
                                                cNamesMap: cssNamesMap,
                                                cNamesToFiles: cssNamesToFiles,
                                                lazyGlobal: true,
                                                file: currentFile,
                                                fileTags: cssTagsMap,
                                                tagsToFiles: cssTagsToFiles
                                            });
                                        } catch (ex) {
                                            reject(ex);
                                        }
                                        cloneAssign(gCSSNamesMap, cssNamesMap);
                                        cloneAssign(gCSSTagToFiles, cssTagsToFiles);
                                        cssGlobal.addReserved(cssNamesMap);
                                        //checker.CSS.fileToSelectors(file, cssNamesMap, inwatch);
                                        //checker.CSS.fileToTags(file, cssTagsMap, inwatch);
                                    }
                                    //checker.CSS.markGlobal(e.from, 'global@' + name + ext);
                                }
                            }
                        }
                        let replacement;
                        if (prefix == 'names' || keys) { //如果是读取css选择器名称对象
                            if (keys) { //从对象中只挑取某几个key
                                checker.CSS.markUsed(markUsedFiles, keys.split(','), e.from);
                                replacement = JSON.stringify(cssNamesMap, keys.split(','));
                            } else { //全部名称对象
                                checker.CSS.markUsed(markUsedFiles, Object.keys(cssNamesMap), e.from);
                                replacement = JSON.stringify(cssNamesMap);
                            }
                        } else if (prefix == 'ref') { //如果是引用css则什么都不用做
                            replacement = '';
                            tail = '';
                        } else if (key) { //仅读取文件中的某个名称
                            checker.CSS.markUsed(markUsedFiles, key, e.from);
                            let c = cssNamesMap[key];
                            if (!c) {
                                if (configs.selectorSilentErrorCss) {
                                    c = key;
                                } else {
                                    checker.CSS.markUnexists(m, e.from);
                                    c = 'unfound-[' + key + ']-from-' + fileName;
                                }
                            }
                            replacement = q + c + q;
                        } else { //输出整个css文件内容
                            if (configs.debug) {
                                if (r.map) {
                                    fileContent += r.map;
                                    let c = JSON.stringify(fileContent);
                                    c = configs.applyStyleProcessor(c, shortCssFile, cssNamesKey, e);
                                    replacement = JSON.stringify(cssNamesKey) + ',' + c;
                                } else if (r.styles) {
                                    replacement = '[';
                                    for (let s of r.styles) {
                                        let c = JSON.stringify(s.css + (s.map || ''));
                                        c = configs.applyStyleProcessor(c, s.short, s.key, e);
                                        replacement += JSON.stringify(s.key) + ',' + c + ',';
                                    }
                                    replacement = replacement.slice(0, -1);
                                    replacement += ']';
                                } else {
                                    let c = JSON.stringify(fileContent);
                                    c = configs.applyStyleProcessor(c, shortCssFile, cssNamesKey, e);
                                    replacement = JSON.stringify(cssNamesKey) + ',' + c;
                                }
                            } else {
                                let c = JSON.stringify(fileContent);
                                c = configs.applyStyleProcessor(c, shortCssFile, cssNamesKey, e);
                                replacement = JSON.stringify(cssNamesKey) + ',' + c;
                            }
                        }
                        tail = tail ? tail : '';
                        return (left || '') + replacement + (right || '') + tail;
                    });
                    resolve(e);
                };
                let check = () => {
                    count--;
                    if (!count && !check.$resume) { //依赖的文件全部读取完毕
                        check.$resume = true;
                        resume();
                    }
                };
                let setFileCSS = (file, shortCssFile, css) => {
                    let p = configs.cssContentProcessor(css, shortCssFile, e);
                    if (!p.then) {
                        p = Promise.resolve(p);
                    }
                    p.then(css => {
                        cssContentCache[file].css = css;
                        check();
                    }, error => {
                        if (e.contentInfo) {
                            file += '@' + e.contentInfo.fileName;
                        }
                        reject(error);
                        check();
                    });
                };
                let processFile = (match, name, ext, file) => {
                    count++; //记录当前文件个数，因为文件读取是异步，我们等到当前模块依赖的css都读取完毕后才可以继续处理

                    let scopedStyle = false;
                    let globalStyle = false;
                    let refInnerStyle = e.contentInfo && name == 'style';
                    let shortCssFile;
                    let markUsedFiles;
                    if (name == 'scoped' && ext == '.style') {
                        file = name + ext;
                        scopedStyle = true;
                        shortCssFile = file;
                        configs.scopedCss.forEach(sc => {
                            deps.addFileDepend(sc, e.from, e.to);
                        });
                        markUsedFiles = configs.scopedCss;
                    } else if (name == 'global' && ext == '.style') {
                        file = name + ext;
                        shortCssFile = file;
                        globalStyle = true;
                        configs.globalCss.forEach(sc => {
                            deps.addFileDepend(sc, e.from, e.to);
                        });
                        markUsedFiles = configs.globalCss;
                    } else {
                        name = atpath.resolveName(name, e.moduleId); //先处理名称
                        if (refInnerStyle) {
                            file = e.from;
                        } else {
                            deps.addFileDepend(file, e.from, e.to);
                            e.fileDeps[file] = 1;
                        }
                        markUsedFiles = file;
                        shortCssFile = file.replace(configs.moduleIdRemovedPath, '').substring(1);
                    }
                    tempMatchToFile[match] = {
                        markUsedFiles,
                        scopedStyle,
                        globalStyle,
                        file,
                        shortCssFile
                    };
                    if (!cssContentCache[file]) { //文件尚未读取
                        cssContentCache[file] = 1;
                        let promise;
                        if (scopedStyle) {
                            promise = Promise.resolve({
                                exists: true,
                                content: gInfo.scopedStyle,
                                styles: gInfo.scopedStyles
                            });
                        } else if (globalStyle) {
                            promise = Promise.resolve({
                                exists: true,
                                content: gInfo.globalStyle,
                                styles: gInfo.globalStyles
                            });
                        } else {
                            promise = cssFileRead(file, e, match, ext, refInnerStyle);
                        }
                        promise.then(info => {
                            //写入缓存，因为同一个view.js中可能对同一个css文件多次引用
                            cssContentCache[file] = {
                                exists: info.exists,
                                css: ''
                            };
                            if (info.exists && info.content) {
                                cssContentCache[file].map = info.map;
                                cssContentCache[file].styles = info.styles;
                                if (!configs.debug) {
                                    cssnano.process(info.content,
                                        Object.assign({}, configs.cssnano)
                                    ).then(r => {
                                        setFileCSS(file, shortCssFile, r.css);
                                    }, error => {
                                        if (e.contentInfo) {
                                            file += '@' + e.contentInfo.fileName;
                                        }
                                        reject(error);
                                        check();
                                    });
                                } else {
                                    let cssStr = info.content;
                                    let store = cmtStores[file] = Object.create(null);
                                    cssStr = cssComment.store(cssStr, store);
                                    setFileCSS(file, shortCssFile, cssStr);
                                }
                            } else {
                                check();
                            }
                        }).catch(reject);
                    } else {
                        check();
                    }
                };
                let tasks = [];
                let doTask = () => {
                    if (tasks.length) {
                        let i = 0;
                        while (i < tasks.length) {
                            processFile.apply(null, tasks[i++]);
                        }
                    } else {
                        resume();
                    }
                };
                e.content.replace(cssTmplReg, (m, left, q, prefix, name, ext, keys, key, right) => {
                    if ((keys || key || prefix) ||
                        (left == '(' && right == ')')) {
                        name = atpath.resolveName(name, e.moduleId);
                        let file = path.resolve(folder + sep + name + ext);
                        if (configs.scopedCssMap[file]) {
                            name = 'scoped';
                            ext = '.style';
                        } else if (configs.globalCssMap[file]) {
                            name = 'global';
                            ext = '.style';
                        }
                        tasks.push([m, name, ext, file]);
                    }
                });
                doTask();
            } else {
                resolve(e);
            }
        });
    });
};