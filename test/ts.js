let jsAst = require('../plugins/js-ast');
let TSKind = jsAst.SKind;
let src = '`abc`';
let ast = jsAst.parse(src, '');
jsAst.walk(ast, node => {
    if (node.kind == TSKind.StringLiteral ||
        node.kind == TSKind.NoSubstitutionTemplateLiteral ||
        node.kind == TSKind.TemplateExpression) {
        let text = src.slice(node.pos, node.end).trim();
        console.log(text);
    }
});
let src1 = `'abc'//测试\n'abce'//zzz\n\`123\${abc}eee\${zz}333\``;
let ast1 = jsAst.parse(src1, '');
jsAst.walk(ast1, node => {
    if (node.kind == TSKind.StringLiteral ||
        node.kind == TSKind.NoSubstitutionTemplateLiteral ||
        node.kind == TSKind.TemplateHead ||
        node.kind == TSKind.TemplateMiddle ||
        node.kind == TSKind.TemplateTail) {
        let text = node.text;
        console.log(text);
    }
});
