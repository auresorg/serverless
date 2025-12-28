const { app } = require("@azure/functions");
const axios = require('axios');
const FormData = require("form-data");

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
        \input{glyphtounicode}

        \DeclareUnicodeCharacter{2070}{\ensuremath{^0}}
        \DeclareUnicodeCharacter{00B9}{\ensuremath{^1}}
        \DeclareUnicodeCharacter{00B2}{\ensuremath{^2}}
        \DeclareUnicodeCharacter{00B3}{\ensuremath{^3}}
        \DeclareUnicodeCharacter{2074}{\ensuremath{^4}}
        \DeclareUnicodeCharacter{2075}{\ensuremath{^5}}
        \DeclareUnicodeCharacter{2076}{\ensuremath{^6}}
        \DeclareUnicodeCharacter{2077}{\ensuremath{^7}}
        \DeclareUnicodeCharacter{2078}{\ensuremath{^8}}
        \DeclareUnicodeCharacter{2079}{\ensuremath{^9}}

        \DeclareUnicodeCharacter{2080}{\ensuremath{_0}}
        \DeclareUnicodeCharacter{2081}{\ensuremath{_1}}
        \DeclareUnicodeCharacter{2082}{\ensuremath{_2}}
        \DeclareUnicodeCharacter{2083}{\ensuremath{_3}}
        \DeclareUnicodeCharacter{2084}{\ensuremath{_4}}
        \DeclareUnicodeCharacter{2085}{\ensuremath{_5}}
        \DeclareUnicodeCharacter{2086}{\ensuremath{_6}}
        \DeclareUnicodeCharacter{2087}{\ensuremath{_7}}
        \DeclareUnicodeCharacter{2088}{\ensuremath{_8}}
        \DeclareUnicodeCharacter{2089}{\ensuremath{_9}}

        \DeclareUnicodeCharacter{2090}{\ensuremath{_a}}
        \DeclareUnicodeCharacter{2091}{\ensuremath{_e}}
        \DeclareUnicodeCharacter{2095}{\ensuremath{_h}}
        \DeclareUnicodeCharacter{1D62}{\ensuremath{_i}}
        \DeclareUnicodeCharacter{2C7C}{\ensuremath{_j}}
        \DeclareUnicodeCharacter{2096}{\ensuremath{_k}}
        \DeclareUnicodeCharacter{2097}{\ensuremath{_l}}
        \DeclareUnicodeCharacter{2098}{\ensuremath{_m}}
        \DeclareUnicodeCharacter{2099}{\ensuremath{_n}}
        \DeclareUnicodeCharacter{2092}{\ensuremath{_o}}
        \DeclareUnicodeCharacter{209A}{\ensuremath{_p}}
        \DeclareUnicodeCharacter{209B}{\ensuremath{_r}}
        \DeclareUnicodeCharacter{209C}{\ensuremath{_s}}
        \DeclareUnicodeCharacter{209D}{\ensuremath{_t}}
        \DeclareUnicodeCharacter{2093}{\ensuremath{_x}}

        \DeclareUnicodeCharacter{207A}{\ensuremath{^+}}
        \DeclareUnicodeCharacter{207B}{\ensuremath{^-}}
        \DeclareUnicodeCharacter{208A}{\ensuremath{_+}}
        \DeclareUnicodeCharacter{208B}{\ensuremath{_-}}

        \DeclareUnicodeCharacter{00A9}{\textcopyright}
        \DeclareUnicodeCharacter{00AE}{\textregistered}
        \DeclareUnicodeCharacter{2122}{\texttrademark}
        \DeclareUnicodeCharacter{2022}{\textbullet}
        \DeclareUnicodeCharacter{2013}{--}
        \DeclareUnicodeCharacter{2014}{---}

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

        \pdfgentounicode=1

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
        try {
            const reqBody = await req.json();
            if (!reqBody) {
                return new Response("No resume data provided", { status: 400 });
            }

            const resumeData = reqBody;

            const texString = renderResume(resumeData);

            const form = new FormData();
            form.append("filecontents[]", texString);
            form.append("filename[]", "document.tex");
            form.append("engine", "pdflatex");
            form.append("return", "pdf");

            const response = await axios.post(
                "https://texlive.net/cgi-bin/latexcgi",
                form,
                {
                    headers: form.getHeaders(),
                    responseType: "arraybuffer",
                }
            );

            if (response.status !== 200) {
                return new Response("Failed to render resume", { status: response.status });
            }

            const filePath = `${resumeData.github}-${resumeData.role}.pdf`;
            const pdfBuffer = Buffer.from(response.data);
            const uploadUrl = `${SUPABASE_URL}/${BUCKET}/${encodeURIComponent(filePath)}`;

            const uploadResponse = await axios.put(
                uploadUrl,
                pdfBuffer,
                {
                    headers: {
                        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/pdf'
                    },
                    validateStatus: () => true
                }
            );

            if (uploadResponse.status !== 200) {
                return new Response("Failed to upload PDF", { status: uploadResponse.status });
            }

            return new Response(pdfBuffer, {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'X-File-Name': filePath 
                }
            });

        } catch (error) {
            return new Response(`Error rendering resume: ${error.message}`, { status: 500 });
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
