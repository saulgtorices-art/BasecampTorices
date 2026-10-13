export const CLAVE_TEMA = "bt-tema";

/**
 * Script que corre antes de pintar (en <head>) para evitar el "flash" de tema
 * equivocado. Debe mantenerse en sincronía con `aplicar()`.
 */
export const SCRIPT_TEMA = `(function(){try{var p=localStorage.getItem("${CLAVE_TEMA}")||"sistema";var o=p==="oscuro"||(p==="sistema"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",o);}catch(e){}})();`;

