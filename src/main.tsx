import {StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

function Boot(){
  const [error,setError]=useState<string|null>(null);
  const [App,setApp]=useState<any>(null);
  useEffect(()=>{ import('./App.tsx').then(m=>setApp(()=>m.default)).catch(e=>setError(e?.stack||e?.message||String(e))); },[]);
  if(error) return <div style={{padding:32,fontFamily:'system-ui',color:'#e9edf5',background:'#080a0f',minHeight:'100vh'}}><h1>YABBAI failed to load</h1><p>Frontend module initialization failed. Check the browser console and run <code>npm run lint</code> and <code>npm run build</code>.</p><pre style={{whiteSpace:'pre-wrap',color:'#ff9b9b'}}>{error}</pre></div>;
  if(!App) return <div style={{padding:32,fontFamily:'system-ui',color:'#e9edf5',background:'#080a0f',minHeight:'100vh'}}><h1>YABBAI Command Center</h1><p>Loading production dashboard…</p></div>;
  return <App/>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Boot/></StrictMode>);
