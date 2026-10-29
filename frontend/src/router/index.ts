import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/panel/schema',
      name: 'panel-schema',
      component: () => import('../views/PanelSchemaView.vue'),
    },
    {
      path: '/panel/koppelingen',
      name: 'panel-koppelingen',
      component: () => import('../views/PanelKoppelingenView.vue'),
    },
  ],
})

export default router
