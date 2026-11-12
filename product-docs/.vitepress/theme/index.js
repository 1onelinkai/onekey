import DefaultTheme from 'vitepress/theme';
import FlowExplorer from './FlowExplorer.vue';
import './custom.css';
export default { extends: DefaultTheme, enhanceApp({ app }) { app.component('FlowExplorer', FlowExplorer); } };
