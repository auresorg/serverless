const path = require('path');
const { app } = require("@azure/functions");
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const util = require('util');
const axios = require('axios');
const { renderResume, setupTectonic, log, critical } = require("../utils");
const { Client } = require('pg');
const { createClient } = require('@vercel/kv');

const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

const execFilePromise = util.promisify(execFile);

// --- CONFIGURATION ---
const SUPABASE_URL = "https://vjuvnrvitnsvfopqukho.supabase.co/storage/v1/object";
const BUCKET = "aurespdf";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ESCAPE_MAP = {
    '\\': '\\textbackslash{}',
    '&': '\\&',
    '%': '\\%',
    '$': '\\$',
    '#': '\\#',
    '_': '\\_',
    '{': '\\{',
    '}': '\\}',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}'
};

function safe(v) {
    if (v == null) return "";

    let s = String(v);

    // 1. Remove ##marker## but KEEP inner text
    // Works anywhere in the string
    s = s.replace(/##.*?##/g, '');

    // 2. Escape LaTeX special characters
    s = s.replace(/[\\&%$#_{}~^]/g, ch => ESCAPE_MAP[ch]);

    return s;
}

const normalizeCa = () => {
    const raw = process.env.POSTGRES_CA || "";
    let candidate = raw;

    if (candidate.startsWith('"') && candidate.endsWith('"')) {
        candidate = candidate.slice(1, -1);
    }

    candidate = candidate.replace(/\\r/g, "").replace(/\\n/g, "\n").trim();

    const begin = '-----BEGIN CERTIFICATE-----';
    const end = '-----END CERTIFICATE-----';

    if (candidate.includes(begin) && candidate.includes(end)) {
        const parts = candidate.split(begin);
        if (parts.length > 1) {
            const inner = parts[1].split(end)[0];
            const base64Body = inner.replace(/\s+/g, '');
            if (base64Body) {
                const chunked = [];
                for (let i = 0; i < base64Body.length; i += 64) {
                    chunked.push(base64Body.slice(i, i + 64));
                }
                candidate = `${begin}\n${chunked.join('\n')}\n${end}`;
            }
        }
    }

    if (!candidate.includes(begin)) {
        try {
            const decoded = Buffer.from(candidate, 'base64').toString('utf8');
            if (decoded.includes(begin)) {
                candidate = decoded;
            }
        } catch { }
    }

    return candidate || undefined;
};

async function fetchFreshData(client, params) {
    const {
        type,
        userId,
        role,
        slug,
        projects = [],
        certifications = [],
        experiences = [],
        awards = []
    } = params;

    const userRes = await client.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
    );

    const userRow = userRes.rows[0];
    if (!userRow) return null;

    let data;

    if (type === 'standard') {
        const res = await client.query(
            `
            SELECT 
                (SELECT row_to_json(e)
                 FROM (SELECT school, degree, field, start_date, end_date, grade
                       FROM education
                       WHERE user_id = $1
                       LIMIT 1) e) AS edu,

                (SELECT json_agg(p)
                 FROM (SELECT name, url, repo, tech, description, start_date, end_date
                       FROM project
                       WHERE user_id = $1 AND role = $2
                       ORDER BY start_date DESC) p) AS projects,

                (SELECT json_agg(c)
                 FROM (SELECT title, platform, description, completed_on
                       FROM certification
                       WHERE user_id = $1 AND role = $2
                       ORDER BY completed_on DESC) c) AS certs,

                (SELECT json_agg(ex)
                 FROM (SELECT title, company, start_date, end_date, description
                       FROM experience
                       WHERE user_id = $1 AND role = $2
                       ORDER BY start_date DESC) ex) AS exps,

                (SELECT json_agg(a)
                 FROM (SELECT title, issuer, type, description, date
                       FROM award
                       WHERE user_id = $1 AND (role = $2 OR role IS NULL)
                       ORDER BY date DESC) a) AS awards
            `,
            [userId, role]
        );

        data = res.rows[0];
    } else if (type === 'custom-direct') {
        const res = await client.query(
            `
        SELECT
            (SELECT row_to_json(e)
             FROM (SELECT school, degree, field, start_date, end_date, grade
                   FROM education
                   WHERE user_id = $1
                   LIMIT 1) e) AS edu,

            (SELECT json_agg(p) FROM project p WHERE id = ANY($2::int[])) AS projects,
            (SELECT json_agg(c) FROM certification c WHERE id = ANY($3::int[])) AS certs,
            (SELECT json_agg(ex) FROM experience ex WHERE id = ANY($4::int[])) AS exps,
            (SELECT json_agg(a) FROM award a WHERE id = ANY($5::int[])) AS awards
        `,
            [userId, projects, certifications, experiences, awards]
        );

        data = res.rows[0];
    }
    else {
        const cRes = await client.query(
            'SELECT * FROM cusres WHERE slug = $1',
            [slug]
        );

        const config = cRes.rows[0];
        if (!config) return null;

        const res = await client.query(
            `
            SELECT
                (SELECT row_to_json(e)
                 FROM (SELECT school, degree, field, start_date, end_date, grade
                       FROM education
                       WHERE user_id = $1
                       LIMIT 1) e) AS edu,

                (SELECT json_agg(p) FROM project p WHERE id = ANY($2::int[])) AS projects,
                (SELECT json_agg(c) FROM certification c WHERE id = ANY($3::int[])) AS certs,
                (SELECT json_agg(ex) FROM experience ex WHERE id = ANY($4::int[])) AS exps,
                (SELECT json_agg(a) FROM award a WHERE id = ANY($5::int[])) AS awards
            `,
            [
                userId,
                config.projects,
                config.certifications,
                config.experiences,
                config.awards
            ]
        );

        data = res.rows[0];
    }

    return {
        github: userRow.username,
        role: role || slug,
        name: `${userRow.firstname} ${userRow.lastname}`,
        email: safe(userRow.email),
        linkedin: safe(userRow.linkedin),
        portfolio: safe(userRow.portfolio),
        leetcode: safe(userRow.leetcode),
        phonenumber: safe(userRow.phonenumber),

        education: data.edu
            ? {
                name: safe(data.edu.school),
                degree: safe(data.edu.degree),
                course: safe(data.edu.field),
                from: safe(data.edu.start_date),
                to: safe(data.edu.end_date),
                score: safe(data.edu.grade)
            }
            : null,

        projects: (data.projects || []).map(p => ({
            title: safe(p.name),
            url: safe(p.url || `https://github.com/${p.repo}`),
            skills: p.tech || [],
            highlights: [safe(p.description)],
            from_date: safe(p.start_date),
            to_date: safe(p.end_date)
        })),

        courses: (data.certs || []).map(c => ({
            title: safe(c.title),
            provider: safe(c.platform),
            completed_at: safe(c.completed_on),
            highlights: [safe(c.description)]
        })),

        experiences: (data.exps || []).map(e => ({
            title: safe(e.title),
            company: safe(e.company),
            from_date: safe(e.start_date),
            to_date: safe(e.end_date),
            highlights: [safe(e.description)]
        })),

        awards: (data.awards || []).map(a => ({
            title: safe(a.title),
            issuer: safe(a.issuer),
            type: safe(a.type),
            date: safe(a.date),
            highlights: [safe(a.description)]
        }))
    };
}

app.http('resume', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req) => {
        log("Received resume generation request");
        const requestId = Math.random().toString(36).substring(7);
        const inputPath = path.join(os.tmpdir(), `${requestId}.tex`);
        const outputPath = path.join(os.tmpdir(), `${requestId}.pdf`);

        const dbUrl = process.env.DATABASE_URL;
        const match = dbUrl.match(
            /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/
        );

        if (!match) {
            return new Response("Invalid DATABASE_URL", { status: 500 });
        }

        const [, dbUser, dbPassword, host, port, database] = match;

        const client = new Client({
            host,
            port,
            user: dbUser,
            password: dbPassword,
            database,
            ssl: {
                rejectUnauthorized: true,
                ca: normalizeCa()
            }
        });

        try {
            const body = await req.json();
            const { type, role, slug, username, mode } = body;
            const isDownload = mode === 'download';
            log("Processing", body);
            await client.connect();

            const payload = await fetchFreshData(client, body);
            if (!payload) {
                return new Response("Not found", { status: 404 });
            }
            const counts = {
                projects: payload.projects.length,
                certificates: payload.courses.length,
                awards: payload.awards.length,
                experience: payload.experiences.length
            };

            const texString = renderResume(payload);
            const executable = await setupTectonic();

            fs.writeFileSync(inputPath, texString);
            await execFilePromise(executable, [inputPath, '--outdir', os.tmpdir()], { env: process.env });

            if (!fs.existsSync(outputPath)) {
                throw new Error("PDF generation failed");
            }

            const pdfBuffer = fs.readFileSync(outputPath);
            const fileName =
                type === 'standard'
                    ? `${username}-${role}.pdf`
                    : `${slug}.pdf`;

            if (isDownload) {
                return new Response(pdfBuffer, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/pdf',
                        'X-File-Name': fileName
                    }
                });
            }

            if (type === 'standard') {
                await client.query(
                    `
                    UPDATE resumes
                    SET projects = $1,
                        certificates = $2,
                        awards = $3,
                        experience = $4,
                        updated_at = NOW()
                    WHERE username = $5 AND role = $6
                    `,
                    [
                        counts.projects,
                        counts.certificates,
                        counts.awards,
                        counts.experience,
                        username,
                        role
                    ]
                );
            }

            await axios.put(
                `${SUPABASE_URL}/${BUCKET}/${encodeURIComponent(fileName)}`,
                pdfBuffer,
                {
                    headers: {
                        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/pdf'
                    }
                }
            );

            return new Response(null, { status: 200 });
        } catch (err) {
            critical("Resume generation error: " + err.message);
            return new Response(`Error: ${err.message}`, { status: 500 });
        } finally {
            await client.end();
            try {
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
            } catch { }
        }
    }
});

app.http("custex", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: async (req) => {
        const dbUrl = process.env.DATABASE_URL;
        const match = dbUrl.match(
            /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/
        );

        if (!match) {
            return new Response("Invalid DATABASE_URL", { status: 500 });
        }

        const [, dbUser, dbPassword, host, port, database] = match;

        const client = new Client({
            host,
            port,
            user: dbUser,
            password: dbPassword,
            database,
            ssl: {
                rejectUnauthorized: true,
                ca: normalizeCa()
            }
        });

        try {
            const body = await req.json();
            if (!body || !body.userId || !body.slug) {
                return new Response("Missing role", { status: 400 });
            }

            await client.connect();

            const payload = await fetchFreshData(client, body);
            if (!payload) {
                return new Response("Not found", { status: 404 });
            }

            const tex = renderResume(payload);

            return new Response(tex, {
                status: 200,
                headers: {
                    "Content-Type": "application/x-tex",
                    "X-File-Name": `${body.slug}.tex`,
                },
            });

        } catch (error) {
            return new Response(`Error: ${error.message}`, { status: 500 });
        } finally {
            await client.end();
        }
    },
});

app.http('resume-direct', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req) => {
        const requestId = Math.random().toString(36).substring(7);
        const inputPath = path.join(os.tmpdir(), `${requestId}.tex`);
        const outputPath = path.join(os.tmpdir(), `${requestId}.pdf`);

        const dbUrl = process.env.DATABASE_URL;
        const match = dbUrl.match(
            /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/
        );

        if (!match) {
            return new Response("Invalid DATABASE_URL", { status: 500 });
        }

        const [, dbUser, dbPassword, host, port, database] = match;

        const client = new Client({
            host,
            port,
            user: dbUser,
            password: dbPassword,
            database,
            ssl: {
                rejectUnauthorized: true,
                ca: normalizeCa()
            }
        });

        try {
            const body = await req.json();

            const {
                userId,
                role,
                projects = [],
                certifications = [],
                experiences = [],
                awards = []
            } = body;

            if (!userId) {
                return new Response("Missing userId", { status: 400 });
            }

            await client.connect();

            const payload = await fetchFreshData(client, {
                type: 'custom-direct',
                userId,
                role,
                projects,
                certifications,
                experiences,
                awards
            });

            if (!payload) {
                return new Response("Not found", { status: 404 });
            }

            const texString = renderResume(payload);
            const executable = await setupTectonic();

            fs.writeFileSync(inputPath, texString);
            await execFilePromise(executable, [inputPath, '--outdir', os.tmpdir()], { env: process.env });

            if (!fs.existsSync(outputPath)) {
                throw new Error("PDF generation failed");
            }

            const pdfBuffer = fs.readFileSync(outputPath);

            return new Response(pdfBuffer, {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'X-File-Name': `${role || 'resume'}.pdf`
                }
            });

        } catch (err) {
            return new Response(`Error: ${err.message}`, { status: 500 });
        } finally {
            await client.end();
            try {
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
            } catch { }
        }
    }
});