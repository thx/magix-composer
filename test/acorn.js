let acorn = require('../plugins/js-acorn');
let source = `({xxxx})`;
let ast = acorn.parse(source);
console.log(JSON.stringify(ast,null,4));