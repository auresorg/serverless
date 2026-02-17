const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const { JAKES_RESUME } = require('./templates');

const TG_TOKEN = process.env.TG_TOKEN;
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

    let TEMPLATE = JAKES_RESUME(data, safeGet, formatDate, formatDateRange);

    return TEMPLATE;
};

async function sendTelegram(msg) {
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: msg
        });
    } catch (e) {
        console.error("Telegram Error:", e.message);
    }
}

async function setupTectonic() {
    if (process.platform === 'win32') {
        return path.join(__dirname, 'tectonic-windows.exe');
    }

    const bundledBinary = path.join(__dirname, 'tectonic');
    const tempBinary = path.join(os.tmpdir(), 'tectonic-ready');

    if (fs.existsSync(tempBinary)) {
        return tempBinary;
    }

    try {
        if (!fs.existsSync(bundledBinary)) {
            await sendTelegram("[CRITICAL] 'tectonic' binary not found in deployment folder!");
            throw new Error("Tectonic binary missing from bundle");
        }

        fs.copyFileSync(bundledBinary, tempBinary);
        fs.chmodSync(tempBinary, '755');
    } catch (error) {
        await sendTelegram("[SETUP ERROR] " + error.message);
        throw error;
    }
    sendTelegram("Executed tectonic setup");
    return tempBinary;
}

module.exports = {
    getDaySuffix,
    formatDate,
    renderResume,
    sendTelegram,
    setupTectonic
};