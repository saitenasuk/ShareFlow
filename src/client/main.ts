import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import AppRoot from './AppRoot.vue'
import './index.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./App.vue') },
    { path: '/s/:id', component: () => import('./pages/ShareView.vue') },
  ],
})

const app = createApp(AppRoot)
app.use(router)
app.mount('#app')
