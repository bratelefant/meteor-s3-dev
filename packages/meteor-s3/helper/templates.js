export function renderTemplate(str, vars) {
  return str.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Missing var ${k}`);
    return String(vars[k]);
  });
}
