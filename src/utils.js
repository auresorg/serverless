const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

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

    let TEMPLATE = String.raw`
        \documentclass[letterpaper,11pt]{article}

        \usepackage{latexsym}
        \usepackage[margin=1in]{geometry}
        \usepackage{titlesec}
        \usepackage{marvosym}
        \usepackage[usenames,dvipsnames]{color}
        \usepackage{verbatim}
        \usepackage{enumitem}
        \usepackage[hidelinks]{hyperref}
        \usepackage{fancyhdr}
        \usepackage[english]{babel}
        \usepackage{tabularx}
        \usepackage{truncate}

        \pagestyle{fancy}
        \fancyhf{} 
        \fancyfoot{}
        \renewcommand{\headrulewidth}{0pt}
        \renewcommand{\footrulewidth}{0pt}

        \addtolength{\oddsidemargin}{-0.5in}
        \addtolength{\evensidemargin}{-0.5in}
        \addtolength{\textwidth}{1in}
        \addtolength{\topmargin}{-.5in}
        \addtolength{\textheight}{1.0in}

        \urlstyle{same}

        \raggedbottom
        \raggedright
        \setlength{\tabcolsep}{0in}

        \titleformat{\section}{
        \vspace{-4pt}\scshape\raggedright\large
        }{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

        \newcommand{\resumeItem}[1]{
        \item\small{
            {#1 \vspace{-2pt}}
        }
        }

        \newcommand{\resumeSubheading}[4]{
        \vspace{-2pt}\item
            \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
            \textbf{#1} & #2 \\
            \textit{\small#3} & \textit{\small #4} \\
            \end{tabular*}\vspace{-7pt}
        }

        \newcommand{\resumeSubSubheading}[2]{
            \item
            \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
            \textit{\small#1} & \textit{\small #2} \\
            \end{tabular*}\vspace{-7pt}
        }

        \newcommand{\resumeProjectHeading}[2]{
            \item
            \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
            \small#1 & #2 \\
            \end{tabular*}\vspace{-7pt}
        }

        \newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

        \renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

        \newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
        \newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
        \newcommand{\resumeItemListStart}{\begin{itemize}}
        \newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

        \begin{document}

        %----------HEADING----------
        \begin{center}
            \textbf{\Huge \scshape ${safeGet(data, 'name')}} \\ \vspace{1pt}
            \small
            ${(() => {
                const items = [];

                // 1. Portfolio
                if (safeGet(data, 'portfolio')) {
                    items.push(
                        String.raw`\href{${safeGet(data, 'portfolio')}}{\underline{Portfolio}}`
                    );
                }

                // 2. LinkedIn
                if (safeGet(data, 'linkedin')) {
                    items.push(
                        String.raw`\href{${safeGet(data, 'linkedin')}}{\underline{LinkedIn}}`
                    );
                }

                // 3. Github
                if (safeGet(data, 'github')) {
                    items.push(
                        String.raw`\href{https://github.com/${safeGet(data, 'github')}}{\underline{Github}}`
                    );
                }

                // 4. Phone (clickable tel link)
                if (safeGet(data, 'phonenumber')) {
                    items.push(
                        String.raw`\href{tel:${safeGet(data, 'phonenumber')}}{\underline{${safeGet(data, 'phonenumber')}}}`
                    );
                }

                // 5. Email
                if (safeGet(data, 'email')) {
                    items.push(
                        String.raw`\href{mailto:${safeGet(data, 'email')}}{\underline{${safeGet(data, 'email')}}}`
                    );
                }

                return items.slice(0, 5).join(' $|$ ');
            })()}
        }
        \end{center}
    `;

    if (safeGet(data, 'education') && safeGet(data, 'education.name')) {
        TEMPLATE += String.raw`
        \section{Education}
        \resumeSubHeadingListStart
            \resumeSubheading
            {${safeGet(data, 'education.name')}}{${safeGet(data, 'education.location') || ''}}
            {${safeGet(data, 'education.degree')} ${safeGet(data, 'education.course') || ''}}
            {${safeGet(data, 'education.from') ? formatDate(safeGet(data, 'education.from')) + (safeGet(data, 'education.to') ? ' -- ' + formatDate(safeGet(data, 'education.to')) : ' -- Present') : ''}} 
        `;

        if (safeGet(data, 'education.score') && safeGet(data, 'education.maxscore')) {
            TEMPLATE += String.raw`
            \resumeItemListStart
                \resumeItem{Scored: ${safeGet(data, 'education.score')} of ${safeGet(data, 'education.maxscore')}}
            \resumeItemListEnd
            `;
        }

        TEMPLATE += String.raw`
        \resumeSubHeadingListEnd
        `;
    }

    if (safeGet(data, 'courses') && data.courses.length > 0) {
        TEMPLATE += String.raw`
        \section{Certifications}
        \resumeSubHeadingListStart
        `;

        for (const course of data.courses) {
            TEMPLATE += String.raw`
                \resumeSubheading
                    {${course.title || ''}}{${formatDateRange(course.started_at, course.completed_at)}}
                    {${course.provider || ''}}{}
                `;

            if (course.highlights && course.highlights.length > 0) {
                TEMPLATE += String.raw`
                \resumeItemListStart
                    ${course.highlights
                        .filter(h => h && h.trim())
                        .map((highlight) => String.raw`\resumeItem{${highlight}}`)
                        .join("")}
                \resumeItemListEnd`;
            }
        }

        TEMPLATE += String.raw`
        \resumeSubHeadingListEnd
        `;
    }

    if (safeGet(data, 'projects') && data.projects.length > 0) {
        TEMPLATE += String.raw`
        \section{Projects}
            \resumeSubHeadingListStart
        `;

        for (const project of data.projects) {
            if (project.title) {
                TEMPLATE += String.raw`
                \resumeProjectHeading
                    {\truncate{0.97\textwidth}{\textbf{${project.url ? String.raw`\href{${project.url}}{${project.title}}` : project.title}} $|$ \emph{${project.skills ? project.skills.filter(s => s && s.trim()).join(', ') : ''}}}}{}
                `;

                if (project.highlights && project.highlights.length > 0) {
                    TEMPLATE += String.raw`
                    \resumeItemListStart
                        ${project.highlights
                            .filter(highlight => highlight && highlight.trim())
                            .map((highlight) => String.raw`\resumeItem{${highlight}}`)
                            .join("")}
                    \resumeItemListEnd
                `;
                }
            }
        }

        TEMPLATE += String.raw` 
            \resumeSubHeadingListEnd
        `;
    }

    if (safeGet(data, 'awards') && data.awards.length > 0) {
        TEMPLATE += String.raw`
        \section{Awards}
        \resumeSubHeadingListStart
        `;

        for (const award of data.awards) {
            if (!award.title) continue;

            TEMPLATE += String.raw`
            \resumeSubheading
                {${award.title}}{${award.date ? formatDate(award.date) : ''}}
                {${award.issuer || ''} ${award.type ? String.raw`\textnormal{\textit{-- ${award.type}}}` : ''}}{}
            `;

            if (award.highlights && award.highlights.length > 0) {
                TEMPLATE += String.raw`
                \resumeItemListStart
                    ${award.highlights
                        .filter(h => h && h.trim())
                        .map((highlight) => String.raw`\resumeItem{${highlight}}`)
                        .join("")}
                \resumeItemListEnd
                `;
            }
        }

        TEMPLATE += String.raw`
        \resumeSubHeadingListEnd
        `;
    }

    if (safeGet(data, 'experiences') && data.experiences.length > 0) {
        TEMPLATE += String.raw`
        \section{Experience}
        \resumeSubHeadingListStart
        `;

        for (const exp of data.experiences) {
            TEMPLATE += String.raw`
            \resumeSubheading
                {${exp.title || ''}}{${formatDateRange(exp.from_date, exp.to_date)}}
                {${exp.company || ''}}{${exp.location || ''}}
            `;

            if (exp.highlights && exp.highlights.length > 0) {
                TEMPLATE += String.raw`
                \resumeItemListStart
                    ${exp.highlights
                        .filter(h => h && h.trim())
                        .map((highlight) => String.raw`\resumeItem{${highlight}}`)
                        .join("")}
                \resumeItemListEnd
                `;
            }
        }

        TEMPLATE += String.raw`
        \resumeSubHeadingListEnd
        `;
    }

    TEMPLATE += String.raw`
    \end{document}
    `;

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