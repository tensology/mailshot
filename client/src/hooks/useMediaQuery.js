import { useEffect, useState } from 'react';

export const useMediaQuery = (query) => {
    const [matches, setMatches] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        const media = window.matchMedia(query);
        const onChange = (event) => setMatches(event.matches);

        setMatches(media.matches);
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, [query]);

    return matches;
};

export const useIsMobile = () => useMediaQuery('(max-width: 1023px)');
