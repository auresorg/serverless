const path = require('path');
const { app } = require("@azure/functions");
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const util = require('util');
const axios = require('axios');
const { renderResume, setupTectonic } = require("../utils");
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

const ESCAPE_MAP = { '\\': '\\textbackslash', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde', '^': '\\textasciicircum' };
const safe = (v) => v == null ? "" : String(v).replace(/[\\&%$#_{}~^]/g, m => ESCAPE_MAP[m]);

async function fetchFreshData(params) {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
        const { type, userId, role, slug } = params;
        const userRes = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (!user) return null;

        let data;
        if (type === 'standard') {
            const res = await client.query(`
                SELECT 
                    (SELECT row_to_json(e) FROM (SELECT school, degree, field, start_date, end_date, grade FROM education WHERE user_id = $1 LIMIT 1) e) AS edu,
                    (SELECT json_agg(p) FROM (SELECT name, url, repo, tech, description, start_date, end_date FROM project WHERE user_id = $1 AND role = $2 ORDER BY start_date DESC) p) AS projects,
                    (SELECT json_agg(c) FROM (SELECT title, platform, description, completed_on FROM certification WHERE user_id = $1 AND role = $2 ORDER BY completed_on DESC) c) AS certs,
                    (SELECT json_agg(ex) FROM (SELECT title, company, start_date, end_date, description FROM experience WHERE user_id = $1 AND role = $2 ORDER BY start_date DESC) ex) AS exps,
                    (SELECT json_agg(a) FROM (SELECT title, issuer, type, description, date FROM award WHERE user_id = $1 AND (role = $2 OR role IS NULL) ORDER BY date DESC) a) AS awards
            `, [userId, role]);
            data = res.rows[0];
        } else {
            const cRes = await client.query('SELECT * FROM cusres WHERE slug = $1', [slug]);
            const config = cRes.rows[0];
            if (!config) return null;
            const res = await client.query(`
                SELECT 
                    (SELECT row_to_json(e) FROM (SELECT school, degree, field, start_date, end_date, grade FROM education WHERE user_id = $1 LIMIT 1) e) AS edu,
                    (SELECT json_agg(p) FROM project p WHERE id = ANY($2::int[])) AS projects,
                    (SELECT json_agg(c) FROM certification c WHERE id = ANY($3::int[])) AS certs,
                    (SELECT json_agg(ex) FROM experience ex WHERE id = ANY($4::int[])) AS exps,
                    (SELECT json_agg(a) FROM award a WHERE id = ANY($5::int[])) AS awards
            `, [userId, config.projects, config.certifications, config.experiences, config.awards]);
            data = res.rows[0];
        }

        return {
            github: user.username, role: role || slug, name: `${user.firstname} ${user.lastname}`, email: safe(user.email),
            linkedin: safe(user.linkedin), portfolio: safe(user.portfolio), leetcode: safe(user.leetcode),
            education: data.edu ? { name: safe(data.edu.school), degree: safe(data.edu.degree), course: safe(data.edu.field), from: safe(data.edu.start_date), to: safe(data.edu.end_date), score: safe(data.edu.grade) } : null,
            projects: (data.projects || []).map(p => ({ title: safe(p.name), url: safe(p.url || `https://github.com/${p.repo}`), skills: p.tech || [], highlights: [safe(p.description)], from_date: safe(p.start_date), to_date: safe(p.end_date) })),
            courses: (data.certs || []).map(c => ({ title: safe(c.title), provider: safe(c.platform), completed_at: safe(c.completed_on), highlights: [safe(c.description)] })),
            experiences: (data.exps || []).map(e => ({ title: safe(e.title), company: safe(e.company), from_date: safe(e.start_date), to_date: safe(e.end_date), highlights: [safe(e.description)] })),
            awards: (data.awards || []).map(a => ({ title: safe(a.title), issuer: safe(a.issuer), type: safe(a.type), date: safe(a.date), highlights: [safe(a.description)] }))
        };
    } finally { await client.end(); }
}

// 1. RESUME GENERATOR
app.http('resume', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req) => {
        const requestId = Math.random().toString(36).substring(7);
        const inputPath = path.join(os.tmpdir(), `${requestId}.tex`);
        const outputPath = path.join(os.tmpdir(), `${requestId}.pdf`);

        try {
            const body = await req.json();
            const { type, userId, role, slug, username, mode } = body;
            const isDownload = mode === 'download';
            const lockKey = type === 'standard' ? `res:${userId}:${role}` : `cus:${slug}`;

            // 1. Debounce Logic: ONLY if not in immediate download mode
            if (!isDownload) {
                await kv.set(lockKey, requestId, { ex: 20 });
                await new Promise(r => setTimeout(r, 5000));
                if ((await kv.get(lockKey)) !== requestId) {
                    return new Response("Superseded", { status: 200 });
                }
            }

            // 2. Data Fetching
            const payload = await fetchFreshData(body);
            if (!payload) return new Response("Not found", { status: 404 });

            // 3. Render and Compile
            const texString = renderResume(payload);
            const executable = await setupTectonic();
            fs.writeFileSync(inputPath, texString);

            await execFilePromise(executable, [inputPath, '--outdir', os.tmpdir()]);
            if (!fs.existsSync(outputPath)) throw new Error("PDF failed to generate");

            const pdfBuffer = fs.readFileSync(outputPath);
            const fileName = type === 'standard' ? `${username}-${role}.pdf` : `${slug}.pdf`;

            // 4. Storage Logic: SKIP if download mode
            if (!isDownload) {
                await axios.put(`${SUPABASE_URL}/${BUCKET}/${encodeURIComponent(fileName)}`, pdfBuffer, {
                    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/pdf' }
                });
            }

            return new Response(pdfBuffer, {
                status: 200,
                headers: { 'Content-Type': 'application/pdf', 'X-File-Name': fileName }
            });

        } catch (error) {
            //log error for debugging
            console.error("Resume Generation Error:", error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        } finally {
            try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch (e) { }
        }
    }
});

// 2. TEX DEBUGGER
app.http('tex', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (req) => {
        try {
            const reqBody = await req.json();
            if (!reqBody) return new Response("No data", { status: 400 });

            return new Response(renderResume(reqBody), {
                status: 200,
                headers: { 'Content-Type': 'text/plain', 'X-File-Name': `${reqBody.github || 'resume'}.tex` }
            });
        } catch (error) {
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    }
});

app.http("custex", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: async (req) => {
        try {
            const reqBody = await req.json();
            if (!reqBody || !reqBody.role) {
                return new Response("Missing slug", { status: 400 });
            }

            // slug is canonical and unique
            const slug = reqBody.role;

            const tex = renderResume(reqBody);

            return new Response(tex, {
                status: 200,
                headers: {
                    "Content-Type": "application/x-tex",
                    "X-File-Name": `${slug}.tex`,
                },
            });
        } catch (error) {
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    },
});
