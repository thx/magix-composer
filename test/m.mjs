import * as Acorn from 'acorn';
import * as Walk from 'acorn-walk';
import * as Autoprefixer from 'autoprefixer';
import * as Chalk from 'chalk';
// import * as Cssnano from 'cssnano';
import HtmlEntities from 'html-entities-decoder';
import HtmlMinify from 'html-minifier';
console.log(Acorn, Walk, Autoprefixer, Chalk, HtmlEntities, HtmlEntities('2'), HtmlMinify.minify('123'));