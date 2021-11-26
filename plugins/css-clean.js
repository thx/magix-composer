let CleanCSS = require('clean-css');
let {
    cssminifier
} = require('./util-const');
let cssCleaner;
module.exports = {
    minify(cssContent) {
        if (!cssCleaner) {
            cssCleaner = new CleanCSS(cssminifier);
        }
        return cssCleaner.minify(cssContent).styles;
    }
}