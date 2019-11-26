let path = require('path');
let fs = require('fs');
let cssnano = require('cssnano');
let fd = require('./util-fd');
let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let actions = {
    str(file) {
        return Promise.resolve(fd.read(file));
    },
    base64(file) {
        let r = Buffer.from(fd.read(file, true));
        return Promise.resolve(r.toString('base64'));
    },
    style(file) {
        let content = fd.read(file);
        return cssnano.process(content,
            Object.assign({}, configs.cssnano)
        ).then(r => {
            return r.css;
        });
    },
    html(file) {
        let content = fd.read(file);
        return tmplCmd.tidy(content);
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
                return JSON.stringify(m);
            });
            resolve(e);
        };
        let check = () => {
            if (tasksCount == completed) {
                resume();
            }
        };
        let readContent = task => {
            fs.access(task[1], (fs.constants ? fs.constants.R_OK : fs.R_OK), e => {
                if (e) {
                    completed++;
                    locker[task[0]] = `can not find ${task[3]}`;
                    check();
                } else {
                    let fn = actions[task[2]];
                    if (!fn) {
                        fn = configs.fileReplacerProcessor;
                    }
                    let p = fn(task[1], task[2]);
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
                tasks.push([m, file, ctrl, name]);
            }
        });
        doTasks();
    });
};