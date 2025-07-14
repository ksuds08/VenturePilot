export const saveIdea = (idea) => {
  try {
    localStorage.setItem('vp_idea', idea);
  } catch {}
};

export const loadIdea = () => {
  try {
    return localStorage.getItem('vp_idea') || '';
  } catch {
    return '';
  }
};
