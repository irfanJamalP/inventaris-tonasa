// Utility: get JWT token from localStorage
export const getToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tonasa_token');
};

// Utility: get user object from localStorage
export const getUser = () => {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('tonasa_user');
  try { return u ? JSON.parse(u) : null; } catch { return null; }
};

// Utility: logout and redirect
export const logout = (router) => {
  localStorage.removeItem('tonasa_token');
  localStorage.removeItem('tonasa_user');
  router.replace('/login');
};
