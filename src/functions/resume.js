const { app } = require("@azure/functions");
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const stream = require('stream');
const axios = require('axios');

const execFilePromise = util.promisify(execFile);
const pipeline = util.promisify(stream.pipeline);

// --- CONFIGURATION ---
const SUPABASE_URL = "https://vjuvnrvitnsvfopqukho.supabase.co/storage/v1/object";
const BUCKET = "aurespdf";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TECTONIC_URL = "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic@0.15.0/tectonic-0.15.0-x86_64-unknown-linux-musl.tar.gz";
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
    const safeGet = (obj, path, defaultValue = '') => {
        return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : defaultValue), obj);
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
            if (safeGet(data, 'portfolio')) {
                items.push(String.raw`\href{${safeGet(data, 'portfolio')}}{\underline{${safeGet(data, 'portfolio').replace(/^https?:\/\//, '')}}}`);
            }
            if (safeGet(data, 'email')) {
                items.push(String.raw`\href{mailto:${safeGet(data, 'email')}}{\underline{${safeGet(data, 'email')}}}`);
            }
            if (safeGet(data, 'linkedin')) {
                try {
                    const url = new URL(safeGet(data, 'linkedin'));
                    items.push(String.raw`\href{${safeGet(data, 'linkedin')}}{\underline{${url.hostname + url.pathname}}}`);
                } catch { }
            }
            if (safeGet(data, 'github')) {
                items.push(String.raw`\href{https://github.com/${safeGet(data, 'github')}}{\underline{github.com/${safeGet(data, 'github')}}}`);
            }
            if (safeGet(data, 'leetcode')) {
                try {
                    const url = new URL(safeGet(data, 'leetcode'));
                    items.push(String.raw`\href{${safeGet(data, 'leetcode')}}{\underline{${url.hostname + url.pathname}}}`);
                } catch { }
            }
            if (safeGet(data, 'phone')) {
                items.push(safeGet(data, 'phone'));
            }
            return items.slice(0, 4).map(item => item.trim()).join(' $|$ ');
        })()
        }
        \end{center}
    `;

    if (safeGet(data, 'education') && safeGet(data, 'education.name')) {
        TEMPLATE += String.raw`
        \section{Education}
        \resumeSubHeadingListStart
            \resumeSubheading
            {${safeGet(data, 'education.name')}}{${safeGet(data, 'education.location')}}
            {${safeGet(data, 'education.degree')} ${safeGet(data, 'education.course')}}
            {${formatDate(safeGet(data, 'education.from'))} -- ${safeGet(data, 'education.to') ? formatDate(safeGet(data, 'education.to')) : 'Present'}} 
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
                    {${course.title}}{${formatDate(course.started_at)} -- ${course.completed_at ? formatDate(course.completed_at) : 'Present'}}
                    {${course.provider}}{}
                `;

            if (course.highlights && course.highlights.length > 0) {
                TEMPLATE += String.raw`
                \resumeItemListStart
                    ${course.highlights
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
                    {\textbf{${project.url ? String.raw`\href{${project.url}}{${project.title}}` : project.title}} $|$ \emph{${project.skills.join(', ')}}}{}
            `;

                if (project.highlights && project.highlights.length > 0) {
                    TEMPLATE += String.raw`
                    \resumeItemListStart
                        ${project.highlights
                            .filter(highlight => highlight)
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
                {${award.title}}{${formatDate(award.date)}}
                {${award.issuer} \textnormal{\textit{-- ${award.type}}}}{}
            `;

            if (award.highlights && award.highlights.length > 0) {
                TEMPLATE += String.raw`
                \resumeItemListStart
                    ${award.highlights
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
                {${exp.title}}{${formatDate(exp.from_date)} -- ${exp.to_date ? formatDate(exp.to_date) : 'Present'}}
                {${exp.company}}{${exp.location}}
            `;

            if (exp.highlights && exp.highlights.length > 0) {
                TEMPLATE += String.raw`
                \resumeItemListStart
                    ${exp.highlights
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

/**
 * LOGIC: Ensures Tectonic binary is ready to run.
 * Windows: Uses local .exe
 * Linux: Downloads fresh binary to /tmp if missing or corrupt.
 */
async function setupTectonic() {
    if (process.platform === 'win32') {
        return path.join(__dirname, 'tectonic-windows.exe');
    }

    const binaryPath = path.join(os.tmpdir(), 'tectonic-v4-fresh');

    // 1. Check if binary exists and is valid (>10MB)
    if (fs.existsSync(binaryPath)) {
        if (fs.statSync(binaryPath).size > 10000000) {
            return binaryPath; // It's good, use it.
        }

        try {
            await sendTelegram("Tectonic binary corrupt, deleting at " + new Date().toString());
        } finally {}

        try { fs.unlinkSync(binaryPath); } catch (e) {} // Corrupt, delete it.
    }

    try {
        await sendTelegram("Tectonic binary missing, downloading at " + new Date().toString());
    } finally {}

    // 2. Download and Setup (Cold Start Only)
    const tarPath = path.join(os.tmpdir(), `tectonic-${Math.random().toString(36).slice(2)}.tar.gz`);

    try {
        const response = await axios.get(TECTONIC_URL, { responseType: 'stream' });
        await pipeline(response.data, fs.createWriteStream(tarPath));

        await execFilePromise('tar', ['-xzf', tarPath, '-C', os.tmpdir()]);
        
        // Tar extracts to 'tectonic', rename it to our versioned name
        fs.renameSync(path.join(os.tmpdir(), 'tectonic'), binaryPath);
        fs.chmodSync(binaryPath, '755');
        
    } finally {
        try { fs.unlinkSync(tarPath); } catch (e) {}
    }

    try {
        await sendTelegram("Tectonic binary setup executed at " + new Date().toString());
    } finally {}

    return binaryPath;
}

// --- HANDLERS ---

// 1. RESUME GENERATOR (Optimized)
app.http('resume', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req) => {
        const runId = Math.random().toString(36).substring(7);
        const inputPath = path.join(os.tmpdir(), `${runId}.tex`);
        const outputPath = path.join(os.tmpdir(), `${runId}.pdf`);

        try {
            const reqBody = await req.json();
            if (!reqBody) return new Response("No data", { status: 400 });

            // A. Prepare Latex & Binary
            const texString = renderResume(reqBody);
            const executable = await setupTectonic();

            // B. Write & Compile
            fs.writeFileSync(inputPath, texString);
            await execFilePromise(executable, [inputPath, '--outdir', os.tmpdir()]);

            if (!fs.existsSync(outputPath)) throw new Error("PDF Output missing");
            
            const pdfBuffer = fs.readFileSync(outputPath);

            // C. Upload (Await ensures success on Consumption plan)
            const filePath = `${reqBody.github}-${reqBody.role}.pdf`;
            await axios.put(`${SUPABASE_URL}/${BUCKET}/${encodeURIComponent(filePath)}`, pdfBuffer, {
                headers: { 
                    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 
                    'Content-Type': 'application/pdf' 
                }
            });

            return new Response(pdfBuffer, {
                status: 200,
                headers: { 'Content-Type': 'application/pdf', 'X-File-Name': filePath }
            });

        } catch (error) {
            return new Response(`Error: ${error.message}`, { status: 500 });
        } finally {
            // Cleanup temp files
            try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch (e) {}
        }
    }
});

// 2. TEX DEBUGGER (Cleaned)
app.http('tex', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req) => {
        try {
            const reqBody = await req.json();
            if (!reqBody) return new Response("No data", { status: 400 });

            return new Response(renderResume(reqBody), {
                status: 200,
                headers: { 
                    'Content-Type': 'text/plain', 
                    'X-File-Name': `${reqBody.github || 'resume'}.tex` 
                }
            });
        } catch (error) {
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    }
});

// 3. KEEP WARM TRIGGER (Prevents Cold Starts)
// Runs every 5 minutes to keep the instance alive.
app.timer('keepWarm', {
    schedule: '0 */5 8-22 * * *',
    runOnStartup: true,
    handler: async () => {
        try {
            await setupTectonic();
            await sendTelegram("Keep-warm pulse executed at " + new Date().toString());
        } catch (e) {
            await sendTelegram("Keep-warm pulse failed at " + new Date().toString() + " with Error: " + e.message);
        }
    }
});