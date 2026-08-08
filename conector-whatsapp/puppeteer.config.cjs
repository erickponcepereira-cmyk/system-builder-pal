/**
 * O conector usa o Chrome/Edge já instalado no computador.
 * Esta configuração é lida pelo instalador do Puppeteer antes do npm terminar.
 * Mantemos também as opções por navegador para compatibilidade entre versões.
 */
module.exports = {
  skipDownload: true,
  chrome: {
    skipDownload: true,
  },
  firefox: {
    skipDownload: true,
  },
};