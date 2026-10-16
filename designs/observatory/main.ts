import { mount } from 'svelte';
import { initApp } from '$core/state/app.svelte';
import './theme.css';
import App from './App.svelte';
import { registerOffline } from '$core/offline';

initApp();
registerOffline();
mount(App, { target: document.getElementById('app')! });
