import { useHashRoute } from './router';
import { HomePage } from './pages/home';
import { AboutPage } from './pages/about';
import { ViewerPage } from './pages/viewer';

export default function App() {
  const { route } = useHashRoute();

  // Simple routing based on hash
  switch (route) {
    case '/':
      return <HomePage />;
    case '/about':
      return <AboutPage />;
    case '/viewer':
      return <ViewerPage />;
    default:
      return <HomePage />;
  }
}
