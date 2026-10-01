import { mount } from 'svelte';
import { initApp } from '$core/state/app.svelte';
import { resolvedTheme } from '$core/state/settings.svelte';
import App from './App.svelte';
import './theme.css';

document.documentElement.dataset.theme = resolvedTheme();
initApp();
mount(App, { target: document.getElementById('app')! });
