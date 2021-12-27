let artCtrl=require('../plugins/tmpl-art-ctrl');

console.log(artCtrl.extractAsExpr('abcd as {[`a${ window[`  {${def[\'a"\\`bc\']}{}`] }`]:xx}'));
console.log(artCtrl.extractAsExpr('list[`a{${  def[`bb${ zz }`]  }}`]'));
console.log(artCtrl.extractAsExpr('list[`ab  as[ d\\$${def}}`] as   {[`zz  ]`] : fb }   key  index   by desc'));
console.log(artCtrl.extractAsExpr('abcd'));
