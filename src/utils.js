const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const { JAKES_COMPACT, JAKES_RESUME } = require('./templates');

const TG_CHAT_ID = process.env.TG_CHAT_ID;

const getDaySuffix = (day) => {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
};

const formatDate = (dateStr, includeDay = false) => {
    if (!dateStr) return '';
    if (dateStr === 'null' || dateStr === null) return '';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return includeDay
        ? `${day}${getDaySuffix(day)} ${month}, ${year}`
        : `${month} ${year}`;
};

const renderResume = (data) => {

    const escapeLatex = (v) => {
        if (v == null) return "";
        return String(v).replace(/[\\&%$#_{}~^]/g, (m) => ({
            '\\': '\\textbackslash{}',
            '&': '\\&',
            '%': '\\%',
            '$': '\\$',
            '#': '\\#',
            '_': '\\_',
            '{': '\\{',
            '}': '\\}',
            '~': '\\textasciitilde{}',
            '^': '\\textasciicircum{}',
        }[m]));
    };

    const safeGet = (obj, path, defaultValue = '') => {
        const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : defaultValue), obj);
        return typeof value === 'string' ? escapeLatex(value) : value;
    };

    const formatDateRange = (start, end) => {
        if (!start) return '';
        const startFormatted = formatDate(start);
        if (!end) return `${startFormatted} -- Present`;
        return `${startFormatted} -- ${formatDate(end)}`;
    };


    let TEMPLATE;
    
    switch (data.template) {
        case 'jakec':
            TEMPLATE = JAKES_COMPACT(data, safeGet, formatDate, formatDateRange);
            break;

        case 'jakes':
            TEMPLATE = JAKES_RESUME(data, safeGet, formatDate, formatDateRange);
            break;

        default:
            TEMPLATE = JAKES_RESUME(data, safeGet, formatDate, formatDateRange);
    }

    return TEMPLATE;
};

async function sendTelegram(msg, token) {
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: msg
        });
    } catch (e) {
        console.error("Telegram Error:", e.message);
    }
}

async function critical(msg) {
    await sendTelegram("SERVERLESS - [CRITICAL] " + msg, process.env.CRITICAL_TG);
}

async function log(msg) {
    await sendTelegram("SERVERLESS - [LOG] " + msg, process.env.LOG_TG);
}

async function setupTectonic() {
    if (process.platform === 'win32') {
        return path.join(__dirname, 'tectonic-windows.exe');
    }

    const bundledBinary = path.join(__dirname, 'tectonic');
    const tempBinary = path.join(os.tmpdir(), 'tectonic-ready');

    //Force per-instance cache
    const cacheDir = path.join(os.tmpdir(), 'tectonic-cache');
    process.env.TECTONIC_CACHE_DIR = cacheDir;

    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    if (fs.existsSync(tempBinary)) {
        return tempBinary;
    }

    try {
        if (!fs.existsSync(bundledBinary)) {
            await critical("'tectonic' binary not found in deployment folder!");
            throw new Error("Tectonic binary missing from bundle");
        }

        fs.copyFileSync(bundledBinary, tempBinary);
        fs.chmodSync(tempBinary, '755');
    } catch (error) {
        await critical("[SETUP ERROR] " + error.message);
        throw error;
    }

    log("Tectonic setup complete, binary ready at: " + tempBinary);
    return tempBinary;
}

module.exports = {
    getDaySuffix,
    formatDate,
    renderResume,
    setupTectonic,
    critical,
    log
};