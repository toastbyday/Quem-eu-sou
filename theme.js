// Aplica a preferência antes de desenhar a página, evitando uma troca de cores ao carregar.
let initialTheme = 'light';
try { if (localStorage.getItem('qes:theme') === 'dark') initialTheme = 'dark'; } catch {}
document.documentElement.dataset.theme = initialTheme;
