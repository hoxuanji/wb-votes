/**
 * The reader's theme choice: one key, one script, one reader of it (ThemeToggle).
 *
 * No saved choice means no attribute on <html>, and iei.css follows the system (`color-scheme: light dark`). A saved 'light' or 'dark'
 * is written to <html data-theme>, which beats the system.
 */
export const THEME_KEY = 'iei-theme';

export type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * Runs from <head> before first paint, so a reader who chose dark never sees a light frame. localStorage can throw (private mode,
 * blocked storage), and a page that cannot remember a choice is still a page, so the failure is swallowed here and nowhere else.
 */
export const THEME_INIT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
