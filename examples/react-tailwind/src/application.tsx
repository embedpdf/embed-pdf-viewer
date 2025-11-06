import { useHashRoute } from './router';
import { HomePage } from './pages/home';
import { AboutPage } from './pages/about';
import { ViewerPage } from './pages/viewer';
import { ViewerSimplePage } from './pages/viewer-simple'; // Changed import

export default function App() {
  const { route } = useHashRoute();

  switch (route) {
    case '/':
      return <HomePage />;
    case '/about':
      return <AboutPage />;
    case '/viewer':
      return <ViewerPage />;
    case '/viewer-simple':
      return <ViewerSimplePage />; // Changed component name
    default:
      return <HomePage />;
  }
}
