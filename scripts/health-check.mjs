const host = process.env.HOST || process.env.BIND_HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const base = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
async function check(p) {
  const r = await fetch(`${base}${p}`, { signal: AbortSignal.timeout(8000) });
  const body = await r.text();
  console.log(`${r.status} ${p} ${body.slice(0, 300)}`);
  if (!r.ok) process.exitCode = 1;
}
await check('/api/health');
if (!process.exitCode) await check('/api/system/status').catch((e) => { console.error(e.message); process.exitCode = 1; });
