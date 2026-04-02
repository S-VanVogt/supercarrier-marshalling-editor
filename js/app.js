/**
 * Application entry point — wires together viewport, renderer, and UI.
 */
import { Viewport } from './viewport.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { routeState } from './route-state.js';

const canvas   = document.getElementById('c');
const viewport = new Viewport(-168, 172, -44, 40);
const renderer = new Renderer(canvas, viewport);
const ui       = new UI(viewport, renderer, routeState);

ui.boot();
window.__vp = viewport;

// Tab switching
document.getElementById('tab-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const tabId = btn.dataset.tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const pane = document.getElementById(tabId);
  if (pane) pane.classList.add('active');
});
