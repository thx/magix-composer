let fs = require('fs');
let path = require('path');
let configs = require('./plugins/util-config');
let fd = require('./plugins/util-fd');
let initEnv = require('./plugins/util-init');
let js = require('./plugins/js');
let jsContent = require('./plugins/js-content');
let deps = require('./plugins/util-deps');
let cssChecker = require('./plugins/checker-css');
let cssGlobal = require('./plugins/css-global');
let jsFileCache = require('./plugins/js-fcache');
let tmplNaked = require('./plugins/tmpl-naked');
let slog = require('./plugins/util-log');
let chalk = require('chalk');
let util = require('util');
let concurrentTask = 1;
// let loading='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
let genMsg = (completed, total) => {
    let len = 40;
    if (completed > total) completed = total;
    let percent = completed / total;
    let cell = Math.round(percent * len);
    let barLeft = '';
    for (let i = 0; i < cell; i++) {
        barLeft += '━';
    }
    let barRight = '';
    for (let i = cell; i < len; i++) {
        barRight += '━';
    }
    let sc = completed + '';
    let st = total + '';
    let diff = st.length - sc.length;
    while (diff) {
        sc = ' ' + sc;
        diff--;
    }
    return sc + '/' + st + ' ' + chalk.blue(barLeft) + chalk.grey(barRight) + ' ' + (percent * 100).toFixed(2) + '%';
};
module.exports = {
    walk: fd.walk,
    readFile: fd.read,
    copyFile: fd.copy,
    writeFile: fd.write,
    removeFile(from) {
        initEnv();
        from = path.resolve(from);
        deps.removeFileDepend(from);
        let to = path.resolve(configs.compiledFolder + from.replace(configs.moduleIdRemovedPath, ''));
        if (fs.existsSync(to)) {
            fs.unlinkSync(to);
        }
        this.removeCache(from);
    },
    removeCache(from) {
        from = path.resolve(from);
        jsFileCache.clear(from);
        cssGlobal.reset(from);
        cssChecker.resetByHost(from);
        cssChecker.resetByTemplate(from);
        cssChecker.resetByStyle(from);
    },
    config(cfg) {
        for (let p in cfg) {
            if (p !== 'cssChecker' &&
                p != 'tmplGlobalVars' &&
                p != 'galleries' &&
                p != 'components' &&
                p != 'revisableStringMap') {
                configs[p] = cfg[p];
            }
        }
        if (cfg) {
            if (cfg.hasOwnProperty('cssChecker')) {
                if (cfg.cssChecker) {
                    if (util.isObject(cfg.cssChecker)) {
                        configs.cssChecker = Object.assign(configs.cssChecker, cfg.cssChecker);
                    }
                } else {
                    configs.cssChecker = {};
                }
            }
        }
        let scopedCssMap = Object.create(null);
        configs.scopedCss = configs.scopedCss.map(p => {
            p = path.resolve(p);
            scopedCssMap[p] = 1;
            return p;
        });
        configs.scopedCssMap = scopedCssMap;
        let specials = [{
            src: 'galleries'
        }, {
            src: 'revisableStringMap'
        }, {
            src: 'components'
        }];
        let merge = (aim, src) => {
            if (util.isObject(src)) {
                if (!aim) aim = {};
                for (let p in src) {
                    aim[p] = merge(aim[p], src[p]);
                }
                return aim;
            } else {
                return src;
            }
        };
        if (cfg) {
            for (let s of specials) {
                if (cfg[s.src] !== undefined) {
                    if (Array.isArray(cfg[s.src])) {
                        for (let v of cfg[s.src]) {
                            configs[s.to || s.src][v] = 1;
                        }
                    } else {
                        configs[s.to || s.src] = merge(configs[s.to || s.src], cfg[s.src]);
                    }
                }
            }
        }
        return configs;
    },
    combine() {
        slog.hook();
        return new Promise((resolve, reject) => {
            initEnv();
            setTimeout(() => {
                let ps = [];
                let total = 0;
                let completed = 0;
                let tasks = [];
                fd.walk(configs.commonFolder, filepath => {
                    if (configs.jsFileExtNamesReg.test(filepath)) {
                        let from = path.resolve(filepath);
                        let to = path.resolve(configs.compiledFolder + from.replace(configs.moduleIdRemovedPath, ''));
                        total++;
                        tasks.push({
                            from,
                            to
                        });
                    }
                });
                if (configs.log) {
                    slog.log(genMsg(++completed, total));
                }
                let errorOccured = false;
                let current = 0;
                let run = () => {
                    errorOccured = false;
                    let tks = tasks.slice(current, current += concurrentTask);
                    if (tks.length) {
                        ps = [];
                        tks.forEach(it => {
                            ps.push(js.process(it.from, it.to).then(() => {
                                if (!errorOccured && configs.log) {
                                    slog.log(genMsg(++completed, total));
                                }
                            }));
                        });
                        Promise.all(ps).then(run).catch(ex => {
                            errorOccured = true;
                            slog.clear(true);
                            reject(ex);
                        });
                    } else {
                        setTimeout(() => {
                            cssChecker.output();
                            slog.clear(true);
                            slog.unhook();
                            resolve();
                        }, 100);
                    }
                };
                run();
            }, 0);
        });
    },
    processFile(from) {
        initEnv();
        from = path.resolve(from);
        this.removeCache(from);
        let to = path.resolve(configs.compiledFolder + from.replace(configs.moduleIdRemovedPath, ''));
        return js.process(from, to, true).then(() => {
            cssChecker.output();
            return Promise.resolve();
        });
    },
    processContent(from, to, content) {
        initEnv();
        from = path.resolve(from);
        this.removeCache(from);
        return jsContent.process(from, to, content, false, false);
    },
    processTmpl() {
        slog.hook();
        return new Promise((resolve, reject) => {
            initEnv();
            let ps = [];
            let total = 0;
            let completed = 0;
            let tasks = [];
            fd.walk(configs.commonFolder, filepath => {
                let from = path.resolve(filepath);
                total++;
                tasks.push(from);
            });
            let errorOccured = false;
            let current = 0;
            let run = () => {
                errorOccured = false;
                let tks = tasks.slice(current, current += concurrentTask);
                if (tks.length) {
                    ps = [];
                    tks.forEach(from => {
                        if (configs.tmplFileExtNamesReg.test(from)) {
                            ps.push(tmplNaked.process(from).then(() => {
                                if (!errorOccured && configs.log) {
                                    slog.log(genMsg(++completed, total));
                                }
                            }));
                        }
                    });
                    Promise.all(ps).then(run).catch(ex => {
                        errorOccured = true;
                        slog.clear(true);
                        reject(ex);
                    });
                } else {
                    setTimeout(() => {
                        slog.clear(true);
                        slog.unhook();
                        resolve();
                    }, 100);
                }
            };
            run();
        });
    },
    getFileDependents(file) {
        return deps.getDependents(file);
    }
};