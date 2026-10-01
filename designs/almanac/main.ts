import { mount } from 'svelte';
import { initApp } from '$core/state/app.svelte';
import './almanac.css';
import App from './App.svelte';

initApp();
mount(App, { target: document.getElementById('app')! });
