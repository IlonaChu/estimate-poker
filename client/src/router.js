import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './views/HomeView.vue';
import SessionView from './views/SessionView.vue';

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: HomeView },
    { path: '/s/:id', component: SessionView },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});
