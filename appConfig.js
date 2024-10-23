import fs from 'fs';
const readConfig = function (configFiles) {
    const config = {};

    configFiles.forEach((file) => {
        if (fs.existsSync(file)) {
            const fileData = fs.readFileSync(file, 'utf-8');
            Object.assign(config, JSON.parse(fileData));
        }
    });
    return config;
};



export { readConfig };
export default appConfig;
