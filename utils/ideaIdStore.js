export const saveIdeaId = (id) => {
  try { localStorage.setItem('vp_ideaId', id); } catch {}
};
export const loadIdeaId = () => {
  try { return localStorage.getItem('vp_ideaId') || ''; } catch { return ''; }
};
