const prisma = require('../config/db');

const getSettings = async () => {
  const settings = await prisma.settings.findMany();
  // Transform to key-value object for easier frontend use
  return settings.reduce((acc, s) => {
    let val = s.value;
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (!isNaN(val) && val.trim() !== '') val = Number(val);
    
    acc[s.key] = val;
    return acc;
  }, {});
};

const updateSetting = async (key, value) => {
  return await prisma.settings.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) }
  });
};

module.exports = { getSettings, updateSetting };
