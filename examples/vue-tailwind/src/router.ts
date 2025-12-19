import { ref, onMounted, onUnmounted } from 'vue';

export function useHashRoute() {
  const route = ref(window.location.hash.slice(1) || '/');

  const handleHashChange = () => {
    route.value = window.location.hash.slice(1) || '/';
  };

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  onMounted(() => {
    window.addEventListener('hashchange', handleHashChange);
  });

  onUnmounted(() => {
    window.removeEventListener('hashchange', handleHashChange);
  });

  return { route, navigate };
}
