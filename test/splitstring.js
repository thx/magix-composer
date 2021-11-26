let generic = require('../plugins/js-generic');
console.log(generic.splitString(`'abc'+def+'zzz'`));
debugger;
console.log(generic.splitString(`'ab\\'c'+def+'\\\\\\'zzz'`))