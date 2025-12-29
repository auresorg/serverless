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

const SUPABASE_URL = "https://vjuvnrvitnsvfopqukho.supabase.co/storage/v1/object";
const BUCKET = "aurespdf";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

app.http('resume', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req) => {
        const totalStart = Date.now();
        try {
            const reqBody = await req.json();
            if (!reqBody) return new Response("No data", { status: 400 });

            // 1. Generate Latex
            // Ensure renderResume is defined above!
            // If you copy-pasted this, make sure you didn't delete the renderResume function block.
            // For this fix, I assume renderResume is still in your file.
            // If you get "renderResume is not defined", paste your renderResume function back in.

            // To be safe, I will re-inject a minimal renderResume call assuming you kept the function:
            let texString = "";
            try {
                texString = renderResume(reqBody);
            } catch (e) {
                // Fallback if function missing during copy-paste
                return new Response("renderResume function missing in code", { status: 500 });
            }

            // 2. Setup Paths
            const isWindows = process.platform === 'win32';
            const runId = Math.random().toString(36).substring(7);
            const inputPath = path.join(os.tmpdir(), `${runId}.tex`);
            const outputDir = os.tmpdir();
            const outputPath = path.join(outputDir, `${runId}.pdf`);

            // 3. EXECUTION LOGIC (The Fix)
            let executablePath;

            if (isWindows) {
                // LOCAL WINDOWS: Use the local file you have
                executablePath = path.join(__dirname, 'tectonic-windows.exe');
            } else {
                // AZURE LINUX: Download fresh to avoid upload corruption
                const cachedBinary = path.join(os.tmpdir(), 'tectonic-linux-downloaded');

                if (!fs.existsSync(cachedBinary)) {
                    console.log("[INIT] Downloading Tectonic binary (First Run Only)...");

                    // URL for the official Linux Musl binary
                    const url = "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic@0.15.0/tectonic-0.15.0-x86_64-unknown-linux-musl.tar.gz";
                    const tarPath = path.join(os.tmpdir(), 'tectonic.tar.gz');

                    // A. Download
                    const response = await axios.get(url, { responseType: 'stream' });
                    await pipeline(response.data, fs.createWriteStream(tarPath));

                    // B. Extract (Azure Linux has 'tar' installed)
                    console.log("[INIT] Extracting binary...");
                    await execFilePromise('tar', ['-xzf', tarPath, '-C', os.tmpdir()]);

                    // The tar contains a file named 'tectonic'. We rename it to avoid conflicts.
                    const extractedFile = path.join(os.tmpdir(), 'tectonic');
                    fs.renameSync(extractedFile, cachedBinary);

                    // C. Cleanup Tar
                    fs.unlinkSync(tarPath);

                    // D. Permission
                    fs.chmodSync(cachedBinary, '755');
                    console.log("[INIT] Setup Complete.");
                }
                executablePath = cachedBinary;
            }

            // 4. Write Tex to Temp File
            fs.writeFileSync(inputPath, texString);

            console.log(`[TIMER] Starting Compilation...`);
            const compileStart = Date.now();

            // 5. Run Tectonic
            // We pass the executable path we prepared above
            await execFilePromise(executablePath, [inputPath, '--outdir', outputDir]);

            console.log(`[TIMER] Compilation took: ${Date.now() - compileStart}ms`);

            // 6. Read Result
            if (!fs.existsSync(outputPath)) {
                throw new Error("PDF generation failed: Output file not found");
            }
            const pdfBuffer = fs.readFileSync(outputPath);

            // 7. Upload to Supabase (FIRE AND FORGET - No Await for speed, Await for safety)
            // We await it here to be safe on Azure Consumption
            const filePath = `${reqBody.github}-${reqBody.role}.pdf`;
            const uploadUrl = `${SUPABASE_URL}/${BUCKET}/${encodeURIComponent(filePath)}`;

            await axios.put(uploadUrl, pdfBuffer, {
                headers: {
                    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/pdf'
                }
            });

            // 8. Cleanup
            try {
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
            } catch (e) { }

            return new Response(pdfBuffer, {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'X-File-Name': filePath
                }
            });

        } catch (error) {
            console.error(error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    }
});

app.http('tex', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req) => {
        try {
            const reqBody = await req.json();
            if (!reqBody) {
                return new Response("No resume data provided", { status: 400 });
            }
            const resumeData = reqBody;

            const texString = renderResume(resumeData);
            return new Response(texString, {
                status: 200,
                headers: {
                    'Content-Type': 'application/x-tex',
                    'X-File-Name': `${resumeData.github}-${resumeData.role}.tex`
                }
            });
        } catch (error) {
            return new Response(`Error generating LaTeX: ${error.message}`, { status: 500 });
        }
    }
});