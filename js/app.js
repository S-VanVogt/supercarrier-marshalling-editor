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
