import { mount } from 'svelte';
import Chooser from './Chooser.svelte';
import { registerOffline } from '../core/offline';

registerOffline();
mount(Chooser, { target: document.getElementById('app')! });
