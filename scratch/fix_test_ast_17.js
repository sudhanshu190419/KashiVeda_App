const fs = require('fs');

const path = 'scratch/test_ast_17_db_pricing.py';
let content = fs.readFileSync(path, 'utf8');

// Replace cur.fetchone()[0] with list(cur.fetchone().values())[0]
content = content.replace(/cur\.fetchone\(\)\[0\]/g, 'list(cur.fetchone().values())[0]');

fs.writeFileSync(path, content, 'utf8');
console.log("Successfully updated fetchone index calls in test_ast_17_db_pricing.py");
