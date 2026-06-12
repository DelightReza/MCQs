import { useState, useEffect } from 'react';

export function usePersistedRecords() {
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [incorrectIds, setIncorrectIds] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const savedBookmarks = localStorage.getItem('bookmarks');
      if (savedBookmarks) {
        setBookmarkedIds(new Set(JSON.parse(savedBookmarks)));
      }
      const savedIncorrect = localStorage.getItem('incorrect');
      if (savedIncorrect) {
        setIncorrectIds(new Set(JSON.parse(savedIncorrect)));
      }
    } catch(e) {
      console.warn("Could not load from localStorage", e);
    }
    setIsLoaded(true);
  }, []);

  const toggleBookmark = (id: string) => {
    setBookmarkedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('bookmarks', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const addIncorrectUrls = (ids: string[]) => {
    setIncorrectIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      localStorage.setItem('incorrect', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const removeIncorrectUrl = (id: string) => {
    setIncorrectIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      localStorage.setItem('incorrect', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const clearIncorrect = () => {
    setIncorrectIds(new Set());
    localStorage.removeItem('incorrect');
  };

  return {
    bookmarkedIds,
    incorrectIds,
    toggleBookmark,
    addIncorrectUrls,
    removeIncorrectUrl,
    clearIncorrect,
    isLoaded
  };
}
