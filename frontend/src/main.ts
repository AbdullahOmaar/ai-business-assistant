import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

function showStartupFailure(error: unknown): void {
  console.error('Application bootstrap failed', error);
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  const host = document.querySelector('aba-root');
  if (!host) return;
  host.innerHTML = `
    <main style="font-family:system-ui,sans-serif;max-width:640px;margin:10vh auto;padding:24px;color:#172033">
      <div style="width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:#a7f3d0;color:#064e3b;font-weight:900;font-size:20px">A</div>
      <h1 style="margin:18px 0 8px">AI Business Assistant couldn't start</h1>
      <p style="line-height:1.6;color:#4b5563">The page loaded, but the application failed during startup. Refresh the page once. If this keeps happening, send the diagnostic message below to support.</p>
      <pre style="white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;border-radius:10px;padding:12px;font-size:12px">${message.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] || character))}</pre>
      <button onclick="location.reload()" style="border:0;border-radius:8px;background:#0f766e;color:white;padding:11px 16px;font-weight:700">Refresh page</button>
    </main>`;
}

bootstrapApplication(AppComponent).catch(showStartupFailure);
