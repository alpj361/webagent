import Fastify from 'fastify';
import cors from '@fastify/cors';
import { chromium, Browser, Page } from 'playwright';
import { z } from 'zod';
import { request } from 'undici';

const PORT = Number(process.env.PORT || 8787);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/auto';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const app = Fastify({ logger: true });
app.register(cors, { origin: true });

const AgentRequestSchema = z.object({
  url: z.string().url(),
  goal: z.string().default('Extract main content and links'),
  maxSteps: z.number().int().min(1).max(10).default(5),
  screenshot: z.boolean().default(true)
});

type AgentRequest = z.infer<typeof AgentRequestSchema>;

const PlanStepSchema = z.object({
  action: z.enum(['click', 'type', 'extract', 'wait', 'scroll']),
  selector: z.string().optional(),
  text: z.string().optional(),
  waitMs: z.number().int().min(0).max(30000).optional()
});

const PlanSchema = z.object({
  url: z.string().url(),
  goal: z.string(),
  steps: z.array(PlanStepSchema).min(1)
});

type Plan = z.infer<typeof PlanSchema>;

interface ExtractedLink {
  text: string;
  href: string;
  selector?: string;
}

interface NavElement {
  selector: string;
  text: string;
}

interface SearchElement {
  selector: string;
  placeholder: string;
}

interface ExtractedContent {
  text: string;
  links: ExtractedLink[];
  navElements?: NavElement[];
  searchElements?: SearchElement[];
}

async function callLLM(prompt: string, systemPrompt?: string): Promise<string> {
  const defaultSystemPrompt = 'You are a web navigation and scraping planner. Respond with concise actions like action:click|extract|type; selector:CSS; text?:string';
  const system = systemPrompt || defaultSystemPrompt;
  
  // OpenRouter
  if (OPENROUTER_API_KEY) {
    const { body } = await request('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ]
      })
    });
    const json: any = await body.json();
    const content = json?.choices?.[0]?.message?.content || '';
    return String(content);
  }
  // OpenAI fallback
  if (OPENAI_API_KEY) {
    const { body } = await request('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ]
      })
    });
    const json: any = await body.json();
    const content = json?.choices?.[0]?.message?.content || '';
    return String(content);
  }
  return 'action:extract; selector:main,article; notes:No LLM key provided, defaulting to extract';
}

async function buildPlan(params: AgentRequest) {
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  const page: Page = await browser.newPage();
  const shots: { step: number; path: string }[] = [];
  try {
    await page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (params.screenshot) {
      const path = `/tmp/plan-${Date.now()}-0.png`;
      await page.screenshot({ path, fullPage: true });
      shots.push({ step: 0, path });
    }
    const html = await page.content();
    const system = 'You are a web navigation planner. Return ONLY compact JSON matching schema {"url": string, "goal": string, "steps": [{"action":"click|type|extract|wait|scroll", "selector"?: string, "text"?: string, "waitMs"?: number}]}. Strict rules: 1) Produce 2-4 steps total when possible. 2) Prefer sequence: click/scroll/wait ... then final extract. 3) Each clickable or typable step MUST include a specific CSS selector. 4) Use wait with waitMs 800-1500 after interactions. 5) Avoid single-step extract unless the page is trivially simple. No extra text.';
    const user = `Plan 2-4 steps to achieve the goal on this page. Prefer click/scroll/wait before a final extract.\nURL: ${params.url}\nGoal: ${params.goal}\nHTML (truncated 12k):\n${html.slice(0, 12000)}`;
    const llmResponse = await callLLM(`${system}\n${user}`);
    const cleaned = llmResponse
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    let plan: Plan;
    try {
      const parsed = JSON.parse(cleaned);
      const validated = PlanSchema.safeParse(parsed);
      if (!validated.success) throw new Error('invalid plan');
      plan = validated.data;
    } catch {
      plan = { url: params.url, goal: params.goal, steps: [{ action: 'extract', selector: 'main,article' }] };
    }
    // Heuristic expansion: if plan has < 2 steps, add a likely click + wait before extract
    if (plan.steps.length < 2) {
      const clickSelector = "a[href*='contact'], a[href*='contacto'], a[href*='soporte'], a[href*='ayuda'], a[href*='servicio'], a[href*='atencion'], a[href*='agencia']";
      const extractSelector = plan.steps.find(s => s.action === 'extract')?.selector || 'main,article,section';
      plan = {
        url: plan.url,
        goal: plan.goal,
        steps: [
          { action: 'click', selector: clickSelector },
          { action: 'wait', waitMs: 1200 },
          { action: 'extract', selector: extractSelector }
        ]
      };
    }
    return { plan, shots };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function runAgent(params: AgentRequest) {
  const browser: Browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage'
    ]
  });
  const page: Page = await browser.newPage();
  const steps: any[] = [];
  const shots: { step: number; path: string }[] = [];
  try {
    await page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < params.maxSteps; i++) {
      if (params.screenshot) {
        const path = `/tmp/shot-${Date.now()}-${i}.png`;
        await page.screenshot({ path, fullPage: true });
        shots.push({ step: i, path });
      }
      const html = await page.content();
      const prompt = `URL: ${params.url}\nGoal: ${params.goal}\nHTML head+body (truncated to 12k):\n${html.slice(0, 12000)}\nReturn one line: action:extract|click|type; selector:CSS; text?:string; notes:...`;
      const plan = await callLLM(prompt);
      steps.push({ i, plan });
      const action = /action:([^;]+)/i.exec(plan)?.[1]?.trim() || 'extract';
      const selector = /selector:([^;]+)/i.exec(plan)?.[1]?.trim() || 'main,article';
      const text = /text:([^;]+)/i.exec(plan)?.[1]?.trim();

      if (action === 'click') {
        try { await page.click(selector, { timeout: 5000 }); } catch {}
        await page.waitForTimeout(1500);
        continue;
      }
      if (action === 'type' && text) {
        try { await page.fill(selector, text, { timeout: 5000 }); } catch {}
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(1500);
        continue;
      }
      // extract
      const content: ExtractedContent = await page.evaluate((sel: string): ExtractedContent => {
        const nodes = Array.from(document.querySelectorAll(sel));
        const text = nodes.map(n => n.textContent?.trim()).filter(Boolean).join('\n').slice(0, 4000);
        const links = Array.from(document.querySelectorAll('a'))
          .map(a => ({ 
            text: a.textContent?.trim() || '', 
            href: (a as HTMLAnchorElement).href,
            selector: a.tagName.toLowerCase() + (a.id ? `#${a.id}` : '') + (a.className ? `.${a.className.replace(/\s+/g, '.')}` : '')
          }))
          .slice(0, 100);
        
        // Extract navigation structure
        const navElements = Array.from(document.querySelectorAll('nav, .nav, [role="navigation"], header ul, .menu'))
          .map(nav => ({
            selector: nav.tagName.toLowerCase() + (nav.id ? `#${nav.id}` : '') + (nav.className ? `.${nav.className.replace(/\s+/g, '.')}` : ''),
            text: nav.textContent?.slice(0, 200) || ''
          }));
          
        // Extract search elements
        const searchElements = Array.from(document.querySelectorAll('input[type="search"], input[placeholder*="buscar"], input[placeholder*="search"], .search-input'))
          .map(el => ({
            selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className.replace(/\s+/g, '.')}` : ''),
            placeholder: (el as HTMLInputElement).placeholder || ''
          }));
        
        return { text, links, navElements, searchElements };
      }, selector);
      return { steps, shots, content };
    }
    return { steps, shots, content: { text: '', links: [], navElements: [], searchElements: [] } };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function executePlan(input: { plan: Plan; screenshot?: boolean }) {
  const { plan } = input;
  const takeShots = input.screenshot ?? true;
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  const page: Page = await browser.newPage();
  const stepsRun: any[] = [];
  const shots: { step: number; path: string }[] = [];
  try {
    await page.goto(plan.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < plan.steps.length; i++) {
      const s = plan.steps[i];
      if (takeShots) {
        const path = `/tmp/exec-${Date.now()}-${i}.png`;
        await page.screenshot({ path, fullPage: true });
        shots.push({ step: i, path });
      }
      stepsRun.push(s);
      if (s.action === 'wait') {
        await page.waitForTimeout(s.waitMs ?? 1000);
        continue;
      }
      if (s.action === 'scroll') {
        await page.evaluate(() => window.scrollBy({ top: window.innerHeight, behavior: 'smooth' }));
        await page.waitForTimeout(800);
        continue;
      }
      if (s.action === 'click' && s.selector) {
        try { await page.click(s.selector, { timeout: 5000 }); } catch {}
        await page.waitForTimeout(1200);
        continue;
      }
      if (s.action === 'type' && s.selector && s.text) {
        try { await page.fill(s.selector, s.text, { timeout: 5000 }); } catch {}
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(1200);
        continue;
      }
      if (s.action === 'extract') {
        const selector = s.selector || 'main,article';
        const content: ExtractedContent = await page.evaluate((sel: string): ExtractedContent => {
          const nodes = Array.from(document.querySelectorAll(sel));
          const text = nodes.map(n => n.textContent?.trim()).filter(Boolean).join('\n').slice(0, 6000);
          const links = Array.from(document.querySelectorAll('a'))
            .map(a => ({ 
              text: a.textContent?.trim() || '', 
              href: (a as HTMLAnchorElement).href,
              selector: a.tagName.toLowerCase() + (a.id ? `#${a.id}` : '') + (a.className ? `.${a.className.replace(/\s+/g, '.')}` : '')
            }))
            .slice(0, 200);
          
          // Extract navigation structure
          const navElements = Array.from(document.querySelectorAll('nav, .nav, [role="navigation"], header ul, .menu'))
            .map(nav => ({
              selector: nav.tagName.toLowerCase() + (nav.id ? `#${nav.id}` : '') + (nav.className ? `.${nav.className.replace(/\s+/g, '.')}` : ''),
              text: nav.textContent?.slice(0, 200) || ''
            }));
            
          // Extract search elements
          const searchElements = Array.from(document.querySelectorAll('input[type="search"], input[placeholder*="buscar"], input[placeholder*="search"], .search-input'))
            .map(el => ({
              selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className.replace(/\s+/g, '.')}` : ''),
              placeholder: (el as HTMLInputElement).placeholder || ''
            }));
          
          return { text, links, navElements, searchElements };
        }, selector);
        return { stepsRun, shots, content };
      }
    }
    return { stepsRun, shots, content: { text: '', links: [], navElements: [], searchElements: [] } };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

app.post('/scrape/agent', async (req, reply) => {
  const parsed = AgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  const result = await runAgent(parsed.data);
  reply.send(result);
});

app.get('/health', async () => ({ ok: true }));

app.post('/plan/build', async (req, reply) => {
  const parsed = AgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  const result = await buildPlan(parsed.data);
  reply.send(result);
});

app.post('/scrape/execute', async (req, reply) => {
  const body: any = req.body;
  const safe = PlanSchema.safeParse(body?.plan);
  if (!safe.success) {
    reply.code(400).send({ error: 'invalid_plan', details: safe.error.flatten() });
    return;
  }
  const res = await executePlan({ plan: safe.data, screenshot: Boolean(body?.screenshot ?? true) });
  reply.send(res);
});

// Endpoint for Explorer functionality
app.post('/explore/summarize', async (req, reply) => {
  const parsed = AgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  
  try {
    // Use the existing runAgent function to scrape and analyze the page
    const result = await runAgent(parsed.data);
    
    // Generate an intelligent summary based on the user's goal
    const summary = await generateExplorerSummary({
      url: parsed.data.url,
      goal: parsed.data.goal,
      content: result.content,
      steps: result.steps
    });
    
    reply.send({ summary, rawResult: result });
  } catch (error: unknown) {
    app.log.error(`Explorer error: ${String(error)}`);
    reply.code(500).send({ 
      error: 'exploration_failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Helper function to generate intelligent summaries for the Explorer
async function generateExplorerSummary(params: {
  url: string;
  goal: string;
  content: ExtractedContent;
  steps: any[];
}): Promise<string> {
  const { url, goal, content, steps } = params;
  
  // Filter relevant links based on the goal
  const relevantLinks = content.links
    .filter(link => {
      const linkText = link.text?.toLowerCase() || '';
      const linkHref = link.href?.toLowerCase() || '';
      const goalLower = goal.toLowerCase();
      
      // Extract key terms from the goal (removing common words)
      const goalTerms = goalLower
        .replace(/necesito|buscar|busco|encontrar|quiero|ver/g, '')
        .replace(/[""]/g, '')
        .trim()
        .split(/\s+/)
        .filter(term => term.length > 2);
      
      return goalTerms.some(term => 
        linkText.includes(term) || linkHref.includes(term)
      );
    })
    .slice(0, 10); // Limit to top 10 relevant links
  
  // Create navigation guidance
  const prompt = `
Analiza esta página web y proporciona una guía DETALLADA y EJECUTABLE para automatización.

**URL**: ${url}
**Objetivo del usuario**: ${goal}

**Contenido encontrado**: 
${content.text.slice(0, 2000)}

**Enlaces relevantes encontrados**:
${relevantLinks.map(link => `- [${link.text}](${link.href})`).join('\n')}

**Todos los enlaces disponibles**:
${content.links.slice(0, 50).map(link => `- [${link.text}](${link.href}) | Selector: \`${link.selector}\``).join('\n')}

**Elementos de navegación detectados**:
${content.navElements?.map(nav => `- Selector: \`${nav.selector}\` | Contenido: "${nav.text.slice(0, 100)}"`).join('\n') || 'No se detectaron elementos de navegación'}

**Elementos de búsqueda detectados**:
${content.searchElements?.map(search => `- Selector: \`${search.selector}\` | Placeholder: "${search.placeholder}"`).join('\n') || 'No se detectaron campos de búsqueda'}

**Pasos realizados**:
${steps.map((step, i) => `${i + 1}. ${step.plan}`).join('\n')}

Responde en formato Markdown ESTRUCTURADO para automatización con estas secciones OBLIGATORIAS:

## 📊 Resumen del Sitio
- Tipo de sitio y función principal
- Estructura general de navegación

## 🎯 Análisis del Objetivo: "${goal}"
- ¿Se encontró contenido relacionado? (SÍ/NO)
- Ubicación exacta del contenido buscado

## 🗺️ Rutas de Navegación Automatizable
### Opción 1: Navegación Directa
\`\`\`
URL_DIRECTA: [URL exacta si existe]
SELECTOR_CSS: [selector del elemento si aplica]
MÉTODO: [click/extract/search]
\`\`\`

### Opción 2: Navegación por Menú
\`\`\`
PASO_1: Click en "[Texto exacto del enlace]" -> URL
PASO_2: Click en "[Texto exacto del submenú]" -> URL  
PASO_3: [Acción final]
\`\`\`

## 📋 Enlaces Específicos Ejecutables
${relevantLinks.length > 0 ? relevantLinks.map(link => `- **${link.text}**: [${link.href}](${link.href})`).join('\n') : '- No se encontraron enlaces específicos'}

## 🔍 Selectores para Automatización
\`\`\`css
/* Selectores CSS identificados para extracción automática */
MENU_PRINCIPAL: "[selector del menú principal]"
BUSQUEDA: "[selector del campo de búsqueda]"
RESULTADOS: "[selector del área de resultados]"
CONTENIDO_OBJETIVO: "[selector del contenido buscado]"
\`\`\`

## 🤖 Script de Automatización Sugerido
\`\`\`javascript
// Pseudocódigo para ejecutor automatizado
1. NAVEGAR_A: ${url}
2. BUSCAR_ELEMENTO: "[selector específico]"
3. ACCION: [click/extract/fill]
4. EXTRAER_DATOS: "[qué datos extraer]"
\`\`\`

## 📈 Términos de Búsqueda Alternativos
${goal.includes('iniciativas') ? '- "proyectos de ley"\n- "propuestas legislativas"\n- "decretos"\n- "resoluciones"' : '- [términos relacionados basados en el objetivo]'}

IMPORTANTE: Proporciona URLs EXACTAS y selectores CSS ESPECÍFICOS que un script automatizado pueda usar sin intervención humana.
`;

  try {
    const explorerSystemPrompt = `You are an expert web automation specialist. Your task is to analyze web pages and provide PRECISE, EXECUTABLE navigation instructions for automated scripts.

CRITICAL REQUIREMENTS:
1. Always provide EXACT URLs and CSS selectors
2. Use the EXACT format specified in the user prompt
3. Include ALL required sections with proper Markdown formatting
4. Focus on automation-friendly instructions (no ambiguous language)
5. Provide specific step-by-step navigation paths
6. Include working CSS selectors from the detected elements
7. Use emojis for section headers as specified

Your response must be structured for automated execution by scripts/crons.`;
    const summaryResponse = await callLLM(prompt, explorerSystemPrompt);
    return summaryResponse;
  } catch (error: unknown) {
    // Fallback summary if LLM fails
    return `## Exploración de ${url}

**Objetivo**: ${goal}

### Contenido encontrado
${content.text.slice(0, 1000)}

### Enlaces relevantes
${relevantLinks.length > 0 
  ? relevantLinks.map(link => `- [${link.text}](${link.href})`).join('\n')
  : 'No se encontraron enlaces específicamente relacionados con tu búsqueda.'
}

### Recomendación
${relevantLinks.length > 0 
  ? 'Revisa los enlaces mostrados arriba que pueden contener la información que buscas.'
  : 'Intenta usar términos de búsqueda más específicos o navegar manualmente por las secciones principales del sitio.'
}`;
  }
}

app.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

