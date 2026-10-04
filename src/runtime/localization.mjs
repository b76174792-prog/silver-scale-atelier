import {readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const locales=Object.freeze(['zh-CN','en','es','fr','ar','ru']);
export const unavailableText='Interface text is unavailable.';
export function normalizeLocale(tag){
 const base=typeof tag==='string'?tag.replaceAll('_','-').toLowerCase().split('-')[0]:'';
 return base==='zh'?'zh-CN':locales.includes(base)?base:'en';
}
export function resolveUiLocale(choice='auto',systemUiLocale){
 if(choice==='auto')return normalizeLocale(systemUiLocale);
 if(!locales.includes(choice))throw Error('Invalid language choice');return choice;
}
async function jsonFile(directory,name){
 const file=join(directory,name),info=await lstat(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size>1024*1024||(await realpath(file)).toLowerCase()!==resolve(file).toLowerCase())throw Error('Catalogue file refused');
 return JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
}
function validSchema(schema){
 if(schema?.schemaVersion!==1||!schema.messages||typeof schema.messages!=='object'||Array.isArray(schema.messages)||!locales.every(locale=>schema.locales?.[locale]?.direction===(locale==='ar'?'rtl':'ltr')))return false;
 const entries=Object.entries(schema.messages);if(entries.length<1||entries.length>512)return false;
 return entries.every(([key,definition])=>/^[A-Za-z0-9_.-]+$/.test(key)&&definition&&definition.args&&typeof definition.args==='object'&&!Array.isArray(definition.args)&&Object.entries(definition.args).every(([name,rule])=>/^[A-Za-z0-9_]+$/.test(name)&&rule&&['number','code','version','enum'].includes(rule.type)&&(rule.type!=='enum'||Array.isArray(rule.values)&&rule.values.length>0&&rule.values.length<=64&&rule.values.every(value=>typeof value==='string'&&value.length<=80))));
}
function validText(text,args){
 if(typeof text!=='string'||!text.trim()||text.length>12000||/[<>]/.test(text))return false;
 const found=[...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match=>match[1]);
 return !/[{}]/.test(text.replace(/\{[A-Za-z0-9_]+\}/g,''))&&Object.keys(args||{}).every(key=>found.includes(key))&&found.every(key=>Object.hasOwn(args||{},key));
}
export async function loadCatalog(directory,locale){
 const chosen=normalizeLocale(locale);let schema={messages:{}},english={},selected={};
 try{const raw=await jsonFile(directory,'catalogue.json');if(validSchema(raw))schema=raw;}catch{}
 const read=async language=>{try{const raw=await jsonFile(directory,language+'.json');return raw.schemaVersion===1&&raw.locale===language&&raw.messages&&typeof raw.messages==='object'?raw.messages:{};}catch{return {};}};
 english=await read('en');selected=chosen==='en'?english:await read(chosen);
 const messages={};for(const [key,definition] of Object.entries(schema.messages))messages[key]=validText(selected[key],definition.args)?selected[key]:validText(english[key],definition.args)?english[key]:unavailableText;
 return {locale:chosen,direction:chosen==='ar'?'rtl':'ltr',messages,definitions:schema.messages};
}
export function formatMessage(catalog,key,args={}){
 const definition=catalog?.definitions?.[key],text=catalog?.messages?.[key];
 if(!definition||typeof text!=='string'||!args||typeof args!=='object'||Array.isArray(args))return unavailableText;
 const allowed=definition.args||{};
 if(Object.keys(args).some(key=>!Object.hasOwn(allowed,key))||Object.keys(allowed).some(key=>!Object.hasOwn(args,key)))return unavailableText;
 for(const [key,rule] of Object.entries(allowed)){
  const value=args[key];
  if(rule.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12)return unavailableText;}
  else if(rule.type==='code'){if(typeof value!=='string'||!/^[A-Z0-9_.-]{1,80}$/.test(value))return unavailableText;}
  else if(rule.type==='version'){if(typeof value!=='string'||!/^\d+(?:\.\d+){0,3}$/.test(value)||value.length>48)return unavailableText;}
  else if(rule.type==='enum'){if(typeof value!=='string'||!Array.isArray(rule.values)||!rule.values.includes(value))return unavailableText;}
  else return unavailableText;
 }
 return text.replace(/\{([A-Za-z0-9_]+)\}/g,(_,name)=>String(args[name]));
}
export async function validateCatalogues(directory){
 const errors=[];let schema;
 try{schema=await jsonFile(directory,'catalogue.json');if(!validSchema(schema))throw Error();}catch{return {ok:false,errors:['catalogue:schema']};}
 const keys=Object.keys(schema.messages).sort();
 if(!keys.length||keys.length>512||keys.some(key=>!/^[A-Za-z0-9_.-]+$/.test(key)))errors.push('catalogue:keys');
 for(const language of locales){
  try{const raw=await jsonFile(directory,language+'.json');
   if(raw.schemaVersion!==1||raw.locale!==language||JSON.stringify(Object.keys(raw.messages||{}).sort())!==JSON.stringify(keys))errors.push(language+':keys');
   for(const key of keys)if(!validText(raw.messages?.[key],schema.messages[key].args))errors.push(language+':'+key);
  }catch{errors.push(language+':file');}
 }
 return {ok:errors.length===0,errors};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await validateCatalogues(process.argv[2]);console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}
