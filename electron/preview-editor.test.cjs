const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEditable, resolveEdit } = require('./preview-editor.cjs');
test('edited JSON preserves credentials in place and validates before writing', () => {
 const editor = createEditable({path:'/tmp/settings.json',after:JSON.stringify({apiKey:'sk-secret-fixture',model:'old',headers:{Authorization:'Bearer private'}})},'sk-secret-fixture');
 assert.ok(!editor.content.includes('sk-secret-fixture'));
 const result=JSON.parse(resolveEdit(editor,editor.content.replace('"old"','"new"')));
 assert.equal(result.apiKey,'sk-secret-fixture');assert.equal(result.model,'new');assert.equal(result.headers.Authorization,'Bearer private');
 assert.throws(()=>resolveEdit(editor,'{'),/格式/);
 assert.throws(()=>resolveEdit(editor,editor.content.replace(/__ONEKEY_SECRET_\w+__/,'changed')),/占位符/);
 const moved=JSON.parse(editor.content);moved.other=moved.apiKey;delete moved.apiKey;
 assert.throws(()=>resolveEdit(editor,JSON.stringify(moved)),/占位符/);
});
test('TOML and YAML editor preserve secrets and credential-only files stay protected',()=>{
 for(const [extension,after] of [['toml','model = "old"\nexperimental_bearer_token = "private"\n'],['yaml','model: old\napi_key: private\n']]) {
  const editor=createEditable({path:'/tmp/config.'+extension,after},'sk-fixture');
  assert.ok(!editor.content.includes('private'));
  assert.match(resolveEdit(editor,editor.content.replace('old','new')),/new/);
 }
 assert.equal(createEditable({path:'/tmp/.env',after:'KEY=private'},'private').editable,false);
 assert.equal(createEditable({path:'/tmp/.credentials.yaml',after:'key: private'},'private').editable,false);
});
test('model visibility hides false by default but allows ID search across categories',async()=>{
 const {filterModels}=await import('../src/model-visibility.mjs');
 const models=[{id:'normal',name:'Normal',category:'文本'},{id:'hidden-id',name:'Private name',category:'其他',showInSquare:false}];
 assert.deepEqual(filterModels(models).map(x=>x.id),['normal']);
 assert.equal(filterModels(models,'Private').length,0);
 assert.equal(filterModels(models,'hidden-id','文本')[0].id,'hidden-id');
});

test('model ID search ignores category and keeps hidden models out of browsing', async () => {
 const { filterModels } = await import('../src/model-visibility.mjs');
 const models = [{id:'normal',name:'Normal',category:'文本'}, {id:'image-id',name:'Image',category:'图片'}, {id:'hidden-id',name:'Hidden title',category:'其他',showInSquare:false}];
 assert.deepEqual(filterModels(models,'image-id','文本').map(x=>x.id),['image-id']);
 assert.deepEqual(filterModels(models,' HIDDEN-ID ','文本').map(x=>x.id),['hidden-id']);
 assert.equal(filterModels(models,'Hidden title','全部').length,0);
 assert.deepEqual(filterModels(models,'','文本').map(x=>x.id),['normal']);
});
