/**
 * 字符串异步替换
 */
let originReplace = String.prototype.replace;
module.exports = (string, searchValue, replacer) => {
    let values = [];
    originReplace.call(string, searchValue, (...args) => {
        values.push(replacer(...args));
    });
    return Promise.all(values).then(resoled => {
        return originReplace.call(string, searchValue, () => resoled.shift());
    });
};