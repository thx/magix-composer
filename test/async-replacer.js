let asyncReplacer = require('../plugins/util-asyncr');

(async () => {
    let str = 'a b c 123';
    console.log(asyncReplacer);
    let r = await asyncReplacer(str, /[a-z]/g, m => {
        return new Promise(resolve => {
            setTimeout(resolve, 100, m + '--');
        });
    });

    console.log(r);
})();