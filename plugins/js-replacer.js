let path = require('path');
let fs = require('fs');
let cssClean = require('./css-clean');
let fd = require('./util-fd');
let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let cssRead = require('./css-read');
let cssTransform = require('./css-transform');
let deps = require('./util-deps');
/**
 * let str=`base64@:./path/to/file.ext`
 * 
 */
let styleId = file => cssTransform.genCssNamesKey(file);
let style = file => {
    let ext = path.extname(file);
    return cssRead(file, {}, '', ext, false).then(r => {
        if (configs.debug) {
            return r.exists ? r.content : 'can not find ' + file;
        }
        return cssClean.minify(r.content);
    }).catch(e => {
        return e.message;
    });
}
let actions = {
    str(file) {
        return JSON.stringify(fd.read(file));
    },
    src(file) {
        return fd.read(file);
    },
    base64(file) {
        let r = Buffer.from(fd.read(file, true));
        return JSON.stringify(r.toString('base64'));
    },
    style(file) {
        return style(file).then(css => {
            return JSON.stringify(css);
        });
    },
    html(file) {
        let content = fd.read(file);
        return JSON.stringify(tmplCmd.tidy(content));
    },
    uId(file) {
        return JSON.stringify(styleId(file));
    },
    as(file) {
        return style(file).then(css => {
            return JSON.stringify([styleId('global') + '-' + styleId(file), css]).slice(1, -1);
        });
    },
    global(file) {
        return style(file).then(css => {
            return JSON.stringify([styleId('global') + '-' + styleId(file), css]).slice(1, -1);
        });
    },
    compiled(file, e) {
        let to = path.resolve(configs.compiledFolder + file.replace(configs.commonFolder, ''));
        return new Promise((resolve, reject) => {
            e.processContent(file, to).then(info => {
                resolve(info.content);
            }).catch(reject);
        });
    }
};
module.exports = e => {
    return new Promise(resolve => {
        let tasks = [],
            tasksCount = 0,
            completed = 0;
        let locker = Object.create(null);
        let folder = path.dirname(e.from);
        let resume = () => {
            e.content = e.content.replace(configs.fileReplacerPrefixesHolderReg, m => {
                m = locker[m];
                return m;
            });
            resolve(e);
        };
        let check = () => {
            if (tasksCount == completed) {
                resume();
            }
        };
        let readContent = task => {
            fs.access(task[1], (fs.constants ? fs.constants.R_OK : fs.R_OK), ex => {
                if (ex) {
                    completed++;
                    locker[task[0]] = `can not find ${task[3]}`;
                    check();
                } else {
                    let fn = actions[task[2]],
                        p;
                    if (fn) {
                        p = fn(task[1], e);
                    } else {
                        p = configs.fileReplacerProcessor(task[2], task[1], e);
                    }
                    if (!p.then) {
                        p = Promise.resolve(p || '');
                    }
                    p.then(src => {
                        completed++;
                        locker[task[0]] = src;
                        check();
                    }).catch(ex => {
                        completed++;
                        locker[task[0]] = `read ${task[1]} error:${ex.message}`;
                        check();
                    });
                }
            });
        };
        let doTasks = () => {
            if (tasksCount > 0) {
                for (let t of tasks) {
                    readContent(t);
                }
            } else {
                resolve(e);
            }
        };
        e.content.replace(configs.fileReplacerPrefixesHolderReg, (m, q, ctrl, name) => {
            let file = path.resolve(folder + path.sep + name);
            if (!locker[m]) {
                tasksCount++;
                locker[m] = 'waiting file read';
                if (e.from && e.to) {
                    deps.addFileDepend(file, e.from, e.to);
                }
                tasks.push([m, file, ctrl, name]);
            }
        });
        doTasks();
    });
};