import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root=process.cwd();
const envPath=path.join(root,'.env');
if(!fs.existsSync(envPath)){
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const r=spawn(npm,['run','setup:live'],{stdio:'inherit',cwd:root});
  const code=await new Promise(resolve=>r.on('exit',c=>resolve(c??1)));
  if(code!==0) process.exit(code);
}
const npm=process.platform==='win32'?'npm.cmd':'npm';
const child=spawn(npm,['run','dev'],{stdio:'inherit',cwd:root});
child.on('exit',code=>process.exit(code??1));
