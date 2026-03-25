/**
 * Application entry point — wires together viewport, renderer, and UI.
 */
import { Viewport } from './viewport.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { routeState } from './route-state.js';

const canvas   = document.getElementById('c');
const viewport = new Viewport(-174, 178, -51, 47);
const renderer = new Renderer(canvas, viewport);
const ui       = new UI(viewport, renderer, routeState);

ui.boot();
