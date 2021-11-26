let md5 = require('../plugins/util-md5');
for (let i = 0; i < 1000; i++) {
    console.log(md5(i, 'ac', '', true));
}
for (let i = 0; i < 1000; i++) {
    console.log(md5(i, 'ac'));
}