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

// 🔧 Anti-bot services configuration
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY || '';
const BRIGHTDATA_KEY = process.env.BRIGHTDATA_KEY || '';
const PROXY_URL = process.env.PROXY_URL || '';

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
  action: z.enum(['click', 'type', 'extract', 'wait', 'scroll', 'hover']),
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

interface NavPathItem {
  path: string; // e.g., "Menú > Submenú > Iniciativas"
  text: string;
  href: string;
}

interface PageScanResult {
  headings: string[];
  navPaths: NavPathItem[];
  allLinks: ExtractedLink[];
}

interface CrawlFinding {
  url: string;
  title: string;
  matched: string[];
}

function extractGoalTerms(goal: string): string[] {
  return goal
    .toLowerCase()
    .replace(/["'.,:\-_/]/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length > 3 && !['necesito','buscar','busco','encontrar','quiero','ver','las','los','de','del','para','con','una','unos','unas'].includes(t))
    .slice(0, 6);
}

// 🤖 Human-like interaction simulation for anti-bot bypass
async function simulateHumanBehavior(page: Page): Promise<void> {
  console.log('🎭 Simulando comportamiento humano para bypass anti-bot...');
  
  try {
    // 1. Random mouse movements
    const movements = [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
      { x: 500, y: 150 },
      { x: 200, y: 400 },
      { x: 400, y: 300 }
    ];
    
    for (const move of movements) {
      await page.mouse.move(move.x, move.y);
      await page.waitForTimeout(500 + Math.random() * 1000); // Random delay 500-1500ms
    }
    
    // 2. Random scrolling behavior
    const scrollSteps = 3 + Math.floor(Math.random() * 3); // 3-5 scroll steps
    for (let i = 0; i < scrollSteps; i++) {
      const scrollAmount = 200 + Math.random() * 400; // Random scroll 200-600px
      await page.evaluate((amount: number) => {
        window.scrollBy({ top: amount, behavior: 'smooth' });
      }, scrollAmount);
      await page.waitForTimeout(800 + Math.random() * 1200); // Random delay 800-2000ms
    }
    
    // 3. Random clicks on safe elements (not forms or buttons)
    const safeSelectors = [
      'body', 'main', 'article', 'section', 
      '.content', '.main-content', '.page-content'
    ];
    
    for (const selector of safeSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const box = await element.boundingBox();
          if (box) {
            const x = box.x + Math.random() * box.width;
            const y = box.y + Math.random() * box.height;
            await page.mouse.click(x, y);
            await page.waitForTimeout(1000 + Math.random() * 2000);
          }
        }
      } catch {}
    }
    
    // 4. Random keyboard activity (safe keys)
    const safeKeys = ['Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const key = safeKeys[Math.floor(Math.random() * safeKeys.length)];
      await page.keyboard.press(key);
      await page.waitForTimeout(300 + Math.random() * 700);
    }
    
    // 5. Random viewport resizing (subtle)
    const currentViewport = page.viewportSize();
    if (currentViewport) {
      const newWidth = currentViewport.width + Math.floor(Math.random() * 20 - 10); // ±10px
      const newHeight = currentViewport.height + Math.floor(Math.random() * 20 - 10);
      await page.setViewportSize({ width: newWidth, height: newHeight });
      await page.waitForTimeout(1000);
      await page.setViewportSize(currentViewport); // Restore original
    }
    
    console.log('✅ Simulación de comportamiento humano completada');
  } catch (error) {
    console.log('⚠️ Error en simulación humana:', error);
  }
}

// 🌐 Anti-bot service integration
async function useAntiBotService(url: string): Promise<string | null> {
  console.log('🔧 Intentando servicios anti-bot...');
  
  // Option 1: ScraperAPI
  if (SCRAPERAPI_KEY) {
    try {
      console.log('📡 Usando ScraperAPI...');
      const scraperApiUrl = `https://api.scraperapi.com/?api_key=${SCRAPERAPI_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=us`;
      
      const { body } = await request(scraperApiUrl);
      const html = await body.text();
      
      if (html && html.length > 1000 && !html.includes('incapsula') && !html.includes('cloudflare')) {
        console.log('✅ ScraperAPI exitoso');
        return html;
      }
    } catch (error) {
      console.log('❌ ScraperAPI falló:', error);
    }
  }
  
  // Option 2: Bright Data
  if (BRIGHTDATA_KEY) {
    try {
      console.log('📡 Usando Bright Data...');
      const brightDataUrl = `https://api.brightdata.com/datasets/global-proxy/requests`;
      
      const { body } = await request(brightDataUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BRIGHTDATA_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url,
          format: 'html',
          country: 'US'
        })
      });
      
      const result = await body.json() as any;
      if (result.html && result.html.length > 1000) {
        console.log('✅ Bright Data exitoso');
        return result.html;
      }
    } catch (error) {
      console.log('❌ Bright Data falló:', error);
    }
  }
  
  // Option 3: Custom Proxy
  if (PROXY_URL) {
    try {
      console.log('📡 Usando Proxy personalizado...');
      const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(url)}`;
      
      const { body } = await request(proxyUrl);
      const html = await body.text();
      
      if (html && html.length > 1000) {
        console.log('✅ Proxy personalizado exitoso');
        return html;
      }
    } catch (error) {
      console.log('❌ Proxy personalizado falló:', error);
    }
  }
  
  console.log('❌ Todos los servicios anti-bot fallaron');
  return null;
}

async function callLLM(prompt: string, systemPrompt?: string): Promise<string> {
  const defaultSystemPrompt = 'You are a web navigation and scraping planner. Respond with concise actions like action:hover|click|extract|type|scroll|wait; selector:CSS; text?:string';
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
    const system = 'You are a web navigation planner. Return ONLY compact JSON matching schema {"url": string, "goal": string, "steps": [{"action":"hover|click|type|extract|wait|scroll", "selector"?: string, "text"?: string, "waitMs"?: number}]}. Strict rules: 1) Produce 2-4 steps total when possible. 2) When the target appears in a submenu, HOVER the parent menu first, then CLICK the submenu item. 3) Prefer sequence: hover/click/scroll/wait ... then final extract. 4) Each clickable/hover/typable step MUST include a specific CSS selector. 5) Use wait with waitMs 800-1500 after interactions. 6) Avoid single-step extract unless the page is trivially simple. No extra text.';
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
    // Heuristic expansion: if plan has < 2 steps, add a likely hover + click + wait before extract
    if (plan.steps.length < 2) {
      const hoverSelector = "nav li:has(a), .menu li:has(a), header nav li:has(a)";
      const clickSelector = "a[href*='iniciativa'], a[href*='iniciativas'], a[href*='ley'], a[href*='legisla'], a[href*='contact'], a[href*='contacto'], a[href*='soporte'], a[href*='ayuda']";
      const extractSelector = plan.steps.find(s => s.action === 'extract')?.selector || 'main,article,section';
      plan = {
        url: plan.url,
        goal: plan.goal,
        steps: [
          { action: 'hover', selector: hoverSelector },
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
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=VizDisplayCompositor'
    ]
  });
  const page: Page = await browser.newPage();
  const steps: any[] = [];
  const shots: { step: number; path: string }[] = [];
  let scan: PageScanResult | null = null;
  const crawlFindings: CrawlFinding[] = [];
  try {
    // 🎭 Configurar página para parecer más humana
    await page.addInitScript(() => {
      // Remover indicadores de automatización
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'permissions', { get: () => ({ query: () => Promise.resolve({ state: 'granted' }) }) });
    });
    
    // Configurar headers realistas
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // 🌐 Intentar servicios anti-bot primero
    const antiBotHtml = await useAntiBotService(params.url);
    if (antiBotHtml) {
      console.log('✅ Usando HTML de servicio anti-bot');
      await page.setContent(antiBotHtml);
    } else {
      console.log('🌐 Navegando directamente...');
      await page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    
    // 🔒 Detección avanzada de anti-bot
    const bodyText = (await page.textContent('body').catch(() => '')) || '';
    const hasAntiBot = bodyText.length < 200 || 
      bodyText.toLowerCase().includes('incapsula') || 
      bodyText.toLowerCase().includes('cloudflare') ||
      bodyText.toLowerCase().includes('checking your browser') ||
      bodyText.toLowerCase().includes('please wait') ||
      bodyText.toLowerCase().includes('ddos protection');
    
    if (hasAntiBot) {
      console.log('🔒 Anti-bot detectado - aplicando estrategias avanzadas...');
      
      // 🎭 Estrategia 1: Simulación de comportamiento humano
      await simulateHumanBehavior(page);
      
      // ⏱️ Estrategia 2: Espera más larga y progresiva
      console.log('⏱️ Esperando resolución de challenge (30 segundos)...');
      await page.waitForTimeout(30000);
      
      // 🔄 Estrategia 3: Recarga con simulación humana
      const bodyText2 = (await page.textContent('body').catch(() => '')) || '';
      if (bodyText2.length < 200) {
        console.log('🔄 Recargando con simulación humana...');
        await simulateHumanBehavior(page);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(5000);
        
        // 🎭 Más simulación después de recarga
        await simulateHumanBehavior(page);
      }
      
      // 🔄 Estrategia 4: Intentar navegación a subpáginas
      const currentUrl = page.url();
      const baseUrl = new URL(currentUrl).origin;
      const subPages = [
        `${baseUrl}/`,
        `${baseUrl}/index.html`,
        `${baseUrl}/home`,
        `${baseUrl}/main`
      ];
      
      for (const subPage of subPages) {
        try {
          console.log(`🔄 Intentando subpágina: ${subPage}`);
          await page.goto(subPage, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await simulateHumanBehavior(page);
          
          const subBodyText = (await page.textContent('body').catch(() => '')) || '';
          if (subBodyText.length > 500) {
            console.log('✅ Subpágina exitosa');
            break;
          }
        } catch {}
      }
    }
    
    // Pre-scan: aggressively expand ALL menus and index complete structure
    try {
      // Step 1: Force hover on ALL potential menu triggers to reveal submenus
      const menuTriggers = await page.$$eval('nav li, header li, .menu li, .navbar li, [role="navigation"] li, .dropdown, .nav-item', 
        (elements: any[]) => elements.map((el: any) => ({
          selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className.replace(/\s+/g, '.')}` : ''),
          hasChildren: el.querySelector('ul, .dropdown-menu, .submenu') !== null,
          text: (el.textContent || '').trim().slice(0, 50)
        }))
      );
      
      // Step 2: Systematically hover each menu item to expand dropdowns
      for (const trigger of menuTriggers) {
        try {
          await page.hover(trigger.selector, { timeout: 300 });
          await page.waitForTimeout(200); // Allow dropdown to appear
        } catch {}
      }
      
      // Step 3: Also try clicking menu toggles (hamburger menus, etc)
      const toggleSelectors = [
        '.menu-toggle', '.nav-toggle', '.hamburger', '[aria-expanded]', 
        'button[data-toggle]', '.dropdown-toggle', '.menu-button'
      ];
      for (const toggle of toggleSelectors) {
        try {
          await page.click(toggle, { timeout: 300 });
          await page.waitForTimeout(300);
        } catch {}
      }
      
      await page.waitForTimeout(500); // Let all menus settle

      scan = await page.evaluate((): PageScanResult => {
        function isVisible(el: Element): boolean {
          const style = window.getComputedStyle(el as HTMLElement);
          return style && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
        }

        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
          .map(h => (h.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 100);

        // Enhanced navigation mapping - capture ALL menu structures
        const navRoots = Array.from(document.querySelectorAll(
          'nav, .nav, [role="navigation"], header, .header, .menu, .menubar, .navbar, .navigation, .main-nav, .primary-nav, .secondary-nav, .sidebar'
        )) as HTMLElement[];
        
        const seen = new Set<string>();
        const navPaths: NavPathItem[] = [];

        function buildCompletePath(element: Element): string[] {
          const path: string[] = [];
          let current: Element | null = element;
          let depth = 0;
          
          // Traverse up to build complete hierarchical path
          while (current && depth < 8) {
            // Look for parent menu items
            const parentLi = current.closest('li') as HTMLLIElement | null;
            if (parentLi && parentLi !== current) {
              // Find the main text/link of this level
              const levelText = parentLi.querySelector(':scope > a, :scope > span, :scope > button, :scope > .nav-link');
              if (levelText) {
                const text = levelText.textContent?.trim();
                if (text && text !== (element.textContent?.trim() || '')) {
                  path.unshift(text);
                }
              }
              current = parentLi.parentElement;
            } else {
              // Check for other container types
              const container = current.closest('ul, .dropdown-menu, .submenu, nav, .nav') as HTMLElement | null;
              if (container && container !== current && container.parentElement) {
                const containerLabel = container.parentElement.querySelector(':scope > a, :scope > span, :scope > button');
                if (containerLabel) {
                  const text = containerLabel.textContent?.trim();
                  if (text && text !== (element.textContent?.trim() || '')) {
                    path.unshift(text);
                  }
                }
                current = container.parentElement.parentElement;
              } else {
                break;
              }
            }
            depth++;
          }
          
          return path;
        }

        // Scan ALL navigation roots extensively
        navRoots.forEach(root => {
          // Get all clickable elements, including nested ones
          const clickables = Array.from(root.querySelectorAll('a, button[onclick], [role="button"], .nav-link, .menu-item')) as HTMLElement[];
          
          clickables.forEach(el => {
            const anchor = el as HTMLAnchorElement;
            const href = anchor.href || anchor.getAttribute('data-href') || '#';
            const text = (el.textContent || '').trim();
            
            if (!text || text.length < 1) return;
            
            const key = href + '|' + text;
            if (seen.has(key)) return;
            seen.add(key);
            
            // Build complete hierarchical path
            const pathParts = buildCompletePath(el);
            pathParts.push(text); // Add the final item
            
            const fullPath = pathParts.join(' > ');
            
            navPaths.push({ 
              path: fullPath, 
              text: text, 
              href: href.startsWith('#') ? window.location.origin + href : href
            });
          });
          
          // Also scan for dropdown/submenu structures specifically
          const dropdowns = Array.from(root.querySelectorAll('.dropdown, .submenu, [aria-haspopup], .has-children')) as HTMLElement[];
          dropdowns.forEach(dropdown => {
            const trigger = dropdown.querySelector('a, button, .dropdown-toggle');
            const submenuItems = Array.from(dropdown.querySelectorAll('.dropdown-menu a, .submenu a, ul a')) as HTMLAnchorElement[];
            
            if (trigger && submenuItems.length > 0) {
              const triggerText = trigger.textContent?.trim() || '';
              submenuItems.forEach(subItem => {
                const subText = subItem.textContent?.trim() || '';
                const subHref = subItem.href || '#';
                
                if (subText && triggerText) {
                  const key = subHref + '|' + subText;
                  if (!seen.has(key)) {
                    seen.add(key);
                    navPaths.push({
                      path: `${triggerText} > ${subText}`,
                      text: subText,
                      href: subHref.startsWith('#') ? window.location.origin + subHref : subHref
                    });
                  }
                }
              });
            }
          });
        });

        const allLinks: ExtractedLink[] = Array.from(document.querySelectorAll('a'))
          .map(a => ({
            text: (a.textContent || '').trim(),
            href: (a as HTMLAnchorElement).href,
            selector: a.tagName.toLowerCase() + (a.id ? `#${a.id}` : '') + (a.className ? `.${(a.className || '').replace(/\s+/g, '.')}` : '')
          }))
          .filter(l => l.href && l.text)
          .slice(0, 500); // Increased limit

        return { headings, navPaths, allLinks };
      });
    } catch {}
    // Heurística inicial: si la meta incluye "iniciativ", intenta preparar submenús
    if (/iniciativ/i.test(params.goal)) {
      try { await page.hover('nav li:has(a), header nav li:has(a), .menu li:has(a)', { timeout: 2000 }); } catch {}
    }
    for (let i = 0; i < params.maxSteps; i++) {
      if (params.screenshot) {
        const path = `/tmp/shot-${Date.now()}-${i}.png`;
        await page.screenshot({ path, fullPage: true });
        shots.push({ step: i, path });
      }
      const html = await page.content();
      const prompt = `URL: ${params.url}\nGoal: ${params.goal}\nHTML head+body (truncated to 12k):\n${html.slice(0, 12000)}\nReturn one line: action:hover|click|type|extract|scroll|wait; selector:CSS; text?:string; notes: If submenu, use hover on parent before click.`;
      const plan = await callLLM(prompt);
      steps.push({ i, plan });
      const action = /action:([^;]+)/i.exec(plan)?.[1]?.trim() || 'extract';
      let selector = /selector:([^;]+)/i.exec(plan)?.[1]?.trim() || 'main,article';
      const text = /text:([^;]+)/i.exec(plan)?.[1]?.trim();

      // Fallback inteligente para metas de "iniciativas" si el selector es genérico o vacío
      const needsIniciativas = /iniciativ/i.test(params.goal);
      const selectorLooksGeneric = selector === 'main,article' || selector.length < 3;
      if (needsIniciativas && (action === 'click' || action === 'extract') && selectorLooksGeneric) {
        // Intentar hover + click por texto y href
        try {
          await page.hover('nav li:has(a), header nav li:has(a), .menu li:has(a)', { timeout: 1500 });
        } catch {}
        const candidates = [
          'a:has-text("Iniciativas de Ley")',
          'a:has-text("Iniciativas")',
          'a[href*="iniciativa"]',
        ];
        let clicked = false;
        for (const c of candidates) {
          try {
            await page.click(c, { timeout: 2000 });
            await page.waitForTimeout(1200);
            selector = 'main,article,section';
            clicked = true;
            break;
          } catch {}
        }
        if (clicked) {
          steps.push({ i, plan: 'fallback:hover+click iniciativas' });
          // Continuar a extracción en este mismo ciclo
        }
      }

      if (action === 'hover') {
        try { await page.hover(selector, { timeout: 5000 }); } catch {}
        await page.waitForTimeout(800);
        continue;
      }
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
          .slice(0, 300);
        
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
      return { steps, shots, content, scan };
    }
    // Mini-crawler: visitar hasta 3 enlaces internos relacionados al objetivo
    try {
      const goalTerms = extractGoalTerms(params.goal);
      if (scan && goalTerms.length > 0) {
        const startHost = new URL(params.url).host;
        type Scored = { href: string; text: string; score: number };
        const scored: Scored[] = [];
        const consider = [...(scan.allLinks || [])];
        consider.forEach(l => {
          try {
            const u = new URL(l.href);
            if (u.host !== startHost) return; // solo interno
            const haystack = `${(l.text||'').toLowerCase()} ${u.pathname.toLowerCase()}`;
            const score = goalTerms.reduce((s, term) => s + (haystack.includes(term) ? 1 : 0), 0);
            if (score > 0) scored.push({ href: u.toString(), text: l.text || '', score });
          } catch {}
        });
        scored.sort((a,b) => b.score - a.score);
        const unique = Array.from(new Map(scored.map(s => [s.href, s])).values()).slice(0, 3);
        for (const cand of unique) {
          try {
            await page.goto(cand.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(500);
            const found = await page.evaluate((terms: string[]) => {
              const title = (document.querySelector('h1,h2')?.textContent || document.title || '').trim();
              const body = (document.body?.innerText || '').toLowerCase();
              const matched = terms.filter(t => body.includes(t));
              return { title, matched };
            }, goalTerms);
            crawlFindings.push({ url: cand.href, title: found.title, matched: found.matched });
          } catch {}
        }
      }
    } catch {}

    return { steps, shots, content: { text: '', links: [], navElements: [], searchElements: [] }, scan, crawlFindings };
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
      if (s.action === 'hover' && s.selector) {
        try { await page.hover(s.selector, { timeout: 5000 }); } catch {}
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

app.post('/scrape/agent', async (req: any, reply: any) => {
  const parsed = AgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  const result = await runAgent(parsed.data);
  reply.send(result);
});

app.get('/health', async () => ({ ok: true }));

// 🔧 Endpoint específico para testing anti-bot
app.post('/test-antibot', async (req: any, reply: any) => {
  const { url } = req.body;
  if (!url) {
    reply.code(400).send({ error: 'url_required' });
    return;
  }
  
  try {
    console.log(`🧪 Testing anti-bot capabilities for: ${url}`);
    
    const browser: Browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page: Page = await browser.newPage();
    
    try {
      // Configurar página anti-detección
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      });
      
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
      });
      
      // Intentar servicios anti-bot primero
      const antiBotHtml = await useAntiBotService(url);
      if (antiBotHtml) {
        await page.setContent(antiBotHtml);
      } else {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }
      
      // Detectar anti-bot
      const bodyText = (await page.textContent('body').catch(() => '')) || '';
      const hasAntiBot = bodyText.length < 200 || 
        bodyText.toLowerCase().includes('incapsula') || 
        bodyText.toLowerCase().includes('cloudflare') ||
        bodyText.toLowerCase().includes('checking your browser');
      
      if (hasAntiBot) {
        console.log('🔒 Anti-bot detectado - aplicando bypass...');
        await simulateHumanBehavior(page);
        await page.waitForTimeout(30000);
        
        const bodyText2 = (await page.textContent('body').catch(() => '')) || '';
        if (bodyText2.length < 200) {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
          await simulateHumanBehavior(page);
        }
      }
      
      const finalHtml = await page.content();
      const finalText = (await page.textContent('body').catch(() => '')) || '';
      
      reply.send({
        success: finalText.length > 500,
        html_length: finalHtml.length,
        text_length: finalText.length,
        has_antibot: hasAntiBot,
        bypass_successful: finalText.length > 500,
        content_preview: finalText.slice(0, 500),
        services_available: {
          scraperapi: !!SCRAPERAPI_KEY,
          brightdata: !!BRIGHTDATA_KEY,
          proxy: !!PROXY_URL
        }
      });
      
    } finally {
      await page.close();
      await browser.close();
    }
  } catch (error: unknown) {
    reply.code(500).send({ 
      error: 'antibot_test_failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.post('/plan/build', async (req: any, reply: any) => {
  const parsed = AgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  const result = await buildPlan(parsed.data);
  reply.send(result);
});

app.post('/scrape/execute', async (req: any, reply: any) => {
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
app.post('/explore/summarize', async (req: any, reply: any) => {
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
      steps: result.steps,
      scan: (result as any).scan,
      crawlFindings: (result as any).crawlFindings || []
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
  scan?: PageScanResult | null;
  crawlFindings?: CrawlFinding[];
}): Promise<string> {
  const { url, goal, content, steps, scan, crawlFindings = [] } = params;
  
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
Analiza la página web y genera una guía ejecutable para automatización.

**URL**: ${url}
**Objetivo del usuario**: ${goal}

**Contenido encontrado**: 
${content.text.slice(0, 2000)}

**Enlaces relevantes encontrados**:
${relevantLinks.map(link => `- [${link.text}](${link.href})`).join('\n')}

**Mapa de navegación detectado (máx 20)**:
${(scan?.navPaths || []).slice(0, 20).map(p => `- ${p.path} → ${p.href}`).join('\n')}

**Resultados del mini-crawler (máx 3)**:
${crawlFindings.map(c => `- ${c.title || '[sin título]'} → ${c.url}`).join('\n') || '- [Sin hallazgos adicionales]'}

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

## 🗺️ Mapa de Navegación Detectado (${(scan?.navPaths || []).length} rutas encontradas)
${(scan?.navPaths || []).length > 0 ? 
  (scan?.navPaths || []).slice(0, 30).map(p => `- ${p.path} → ${p.href}`).join('\n') :
  '- No se detectaron rutas de navegación estructuradas'
}

## 🔍 Hallazgos del Mini-Crawler
${crawlFindings.length > 0 ? 
  crawlFindings.map(c => `- **${c.title || '[sin título]'}** → ${c.url}\n  Términos encontrados: ${c.matched.join(', ') || 'ninguno'}`).join('\n') :
  '- No se exploraron páginas adicionales'
}

## 🎯 Análisis del Objetivo: "${goal}"
- ¿Se encontró contenido relacionado? (SÍ/NO)
- Ubicación exacta del contenido buscado

## 🚀 Rutas de Navegación Automatizable
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

## ⚙️ Selectores para Automatización
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

app.listen({ port: PORT, host: '0.0.0.0' }).catch((err: any) => {
  app.log.error(err);
  process.exit(1);
});

