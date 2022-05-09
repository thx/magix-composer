let cssUsedReg = /(['"])?magix-composer\s*#\s*css-used\(([^\r\n]+?)\)\1\s*/g;

module.exports = (css) => {
    let used = {};
    css.replace(cssUsedReg, (_, q, content) => {
        let cs = content.split(',');
        for (let c of cs) {
            used[c] = 1;
        }
    });
    return { used };
};