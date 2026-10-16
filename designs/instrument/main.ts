import { mount } from 'svelte';
import { initApp } from '$core/state/app.svelte';
import { resolvedTheme } from '$core/state/settings.svelte';
import App from './App.svelte';
import './theme.css';
import { registerOffline } from '$core/offline';

document.documentElement.dataset.theme = resolvedTheme();
initApp();
registerOffline();
mount(App, { target: document.getElementById('app')! });
