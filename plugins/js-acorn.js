/*
acorn lib
 */
let acorn = require('acorn');
let walker = require('acorn-walk');
let importMeta = require('acorn-import-meta');
acorn = acorn.Parser.extend(importMeta);
module.exports = {
    parse(tmpl, comments, sourceFile) {
        return acorn.parse(tmpl, {
            sourceType: 'module',
            sourceFile,
            ecmaVersion: 11,
            onComment(block, text, start, end) {
                if (comments) {
                    comments[start] = {
                        text: text.trim()
                    };
                    comments[end] = {
                        text: text.trim()
                    };
                }
            }
        });
    },
    walk(ast, visitors) {
        walker.simple(ast, visitors, walker.base);
    }
};