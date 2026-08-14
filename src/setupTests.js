// Polyfills pour l'environnement jsdom de Jest.
// jsdom n'expose pas TextEncoder/TextDecoder, requis par react-router v7.
const { TextEncoder, TextDecoder } = require("util");

if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;

// Indique à React que les rendus des tests sont encadrés par act().
global.IS_REACT_ACT_ENVIRONMENT = true;
