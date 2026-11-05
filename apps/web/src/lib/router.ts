import { useEffect, useState } from 'react';
export type Route = '' | 'tableau-de-bord' | 'territoires' | 'analyses' | 'donnees' | 'rapports';
const read = () => window.location.hash.replace(/^#\/?/, '').split('?')[0] ?? '';
export function useRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const href = (r: Route) => `#/${r}`;
