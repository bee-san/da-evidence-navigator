// Starts the flow named in <div id="flow" data-flow="…">.
import { runFlow } from './flow.js';

const root = document.getElementById('flow');
const { default: flow, onRender } = await import(`./flows/${root.dataset.flow}.js`);
runFlow(root, flow, 'Domestic abuse evidence for legal aid', { onRender });
