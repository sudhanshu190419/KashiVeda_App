const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envVars = {};
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!(key in envVars)) {
            envVars[key] = val;
          }
        }
      }
    }
  }
  return { ...envVars, ...process.env };
}

module.exports = function (api) {
  if (api && api.cache) {
    api.cache(false);
  }
  const mergedEnv = loadEnvFile();

  const inlineEnvPlugin = ({ types: t }) => ({
    visitor: {
      MemberExpression(nodePath) {
        if (
          nodePath.get('object').isMemberExpression() &&
          nodePath.get('object.object').isIdentifier({ name: 'process' }) &&
          nodePath.get('object.property').isIdentifier({ name: 'env' })
        ) {
          const key = nodePath.node.property.name || nodePath.node.property.value;
          if (key && mergedEnv[key] !== undefined) {
            nodePath.replaceWith(t.stringLiteral(mergedEnv[key]));
          }
        }
      },
    },
  });

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [inlineEnvPlugin],
  };
};
