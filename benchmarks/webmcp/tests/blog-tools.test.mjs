import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const patch = readFileSync(new URL('../goldens/tailwind-nextjs-blog.reference.patch', import.meta.url), 'utf8');
const section = patch.split('+++ b/components/WebMcpAskSite.tsx\n')[1].split('diff --git ')[0];
const source = section.split('\n').filter(line => line.startsWith('+')).map(line => line.slice(1)).join('\n')
 .replace(/^import .*$/gm, '').replace('export default function', 'function');
const docs = [
 { kind: 'author', title: 'About Dana Example', keywords: ['about','author'], path: '/about', body: 'Dana researches atmospheric science.' },
 { kind: 'author', title: 'About Other Writer', keywords: ['about','author'], path: '/blog/example', body: 'At birth the child-name was Different.' },
 { kind: 'post', title: 'Example article', path: '/blog/example', body: 'A sample article.' },
];
async function toolsFor(path='/about/') {
 const tools=new Map();
 const context=vm.createContext({siteMetadata:{title:'Blog',description:'Example blog'}, location:{pathname:path}, document:{modelContext:{registerTool:tool=>tools.set(tool.name,tool)}}, useEffect:callback=>callback(), fetch:async()=>({json:async()=>docs}), console});
 vm.runInContext(stripTypeScriptTypes(source)+';WebMcpAskSite()',context);
 await new Promise(resolve=>setImmediate(resolve));
 return tools;
}
test('exact page tool reads the displayed path and search retains relevant content across phrasing',async()=>{
 const tools=await toolsFor();
 assert.deepEqual([...tools.keys()].sort(),['ask_site','read_page']);
 const read=JSON.parse((await tools.get('read_page').execute({})).content[0].text);
 assert.equal(read.path,'/about');assert.equal(read.documents.length,1);assert.equal(read.documents[0].title,'About Dana Example');
 for(const query of ["What is the author's full name on the About page?",'author','about author full name']) {
  const search=JSON.parse((await tools.get('ask_site').execute({query})).content[0].text);
  assert(search.results.some(doc=>doc.path==='/about'),query);
 }
 const scoped=JSON.parse((await tools.get('ask_site').execute({query:'author',path:'/about/'})).content[0].text);
 assert.equal(scoped.results.length,1);assert.equal(scoped.results[0].path,'/about');
 const missing=JSON.parse((await tools.get('read_page').execute({path:'/missing'})).content[0].text);
 assert.equal(missing.found,false);assert.equal(missing.documents.length,0);
 const unrelated=JSON.parse((await tools.get('ask_site').execute({query:'zzzzzunknown'})).content[0].text);
 assert.equal(unrelated.results.length,0);
});
test('page reading follows navigation and never substitutes the About author for other pages',async()=>{
 const tools=await toolsFor('/blog/example');
 const read=JSON.parse((await tools.get('read_page').execute({})).content[0].text);
 assert.equal(read.documents.length,2);
 assert(read.documents.every(doc=>doc.path==='/blog/example'));
 assert(!JSON.stringify(read).includes('Dana Example'));
});
