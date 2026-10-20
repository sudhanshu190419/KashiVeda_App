const { execSync } = require('child_process');

const zones = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles'];
for (const tz of zones) {
  const code = `
    const date = new Date('2026-10-10');
    console.log(process.env.TZ, 'getDate():', date.getDate(), 'getTimezoneOffset():', date.getTimezoneOffset());
  `;
  const out = execSync(`node -e "${code.replace(/\n/g, ' ')}"`, {
    env: { ...process.env, TZ: tz },
  }).toString().trim();
  console.log(out);
}
